import type { Order } from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";
// net-terms.service.ts — "Pay on invoice (net 30/60)" for approved business
// accounts: confirmation at checkout, admin mark-paid, credit release on
// cancellation, and the receivables list.
//
// Ledger consistency:
// - payments: one row per net-terms order (payment_method = gateway =
//   net_terms), `authorized` on confirmation, `captured` on mark-paid.
// - commissions: untouched here. They are created `held` at order time and
//   the settlement job refuses to promote them while the order is on terms
//   and not captured (commission-settlement.job.ts), so vendor_payouts never
//   include an unpaid net-terms sale.
// - business_credit_accounts.outstanding_fils: changed only while holding
//   SELECT ... FOR UPDATE on the credit row.
import {
  type NetTermsBlockReason,
  checkNetTermsEligibility,
  daysOverdue,
  netTermsDueDate,
  receivableStatus,
} from "@materialhub/utils";
import type { EntityManager, Repository } from "typeorm";
import { type BusinessContext, loadBusinessContext } from "./business-context.ts";

export interface NetTermsSideEffects {
  recordCouponUsage(orderId: string): Promise<void>;
  clearCustomerCart(userId: string | null | undefined): Promise<void>;
  triggerAutoShipments(orderId: string): Promise<void>;
  emitOrderPlaced(orderId: string, userId?: string | null): Promise<void>;
}

export const NET_TERMS_REASON_KEYS: Record<NetTermsBlockReason, string> = {
  no_business: "payment.net_terms.not_verified",
  not_verified: "payment.net_terms.not_verified",
  not_approved: "payment.net_terms.not_verified",
  overdue: "payment.net_terms.overdue",
  over_credit: "payment.net_terms.over_credit",
  invalid_amount: "payment.net_terms.over_credit",
};

const BLOCK_MESSAGES: Record<NetTermsBlockReason, string> = {
  no_business: "Pay on invoice is for approved business accounts",
  not_verified: "Pay on invoice is available once your company is verified",
  not_approved: "Your company does not have approved net terms",
  overdue: "Pay your overdue invoices to use pay on invoice again",
  over_credit: "This order is above your remaining credit",
  invalid_amount: "This order can't be put on terms",
};

export interface ConfirmResult {
  status: "confirmed";
  order_id: string;
  terms: "net_30" | "net_60";
  payment_due_at: string;
  idempotent?: boolean;
}

interface ReceivableRow {
  order_id: string;
  order_number: string;
  business_account_id: string | null;
  legal_name: string | null;
  trn: string | null;
  terms: string;
  amount_fils: string | number;
  confirmed_at: Date | null;
  due_at: Date | null;
  payment_status: string;
  paid_at: Date | null;
  payment_reference: string | null;
}

interface ReceivableInvoiceRow {
  id: string;
  order_id: string;
  invoice_number: string;
  seller_name: string | null;
  payable_fils: string | number;
}

export class NetTermsService {
  constructor(
    private orderRepo: Repository<Order>,
    private sideEffects: NetTermsSideEffects,
  ) {}

  private get manager(): EntityManager {
    return this.orderRepo.manager;
  }

  context(userId: string): Promise<BusinessContext | null> {
    return loadBusinessContext(this.manager, userId);
  }

  /** Quote-time availability (no locks). */
  eligibility(ctx: BusinessContext | null, amountFils: number) {
    return checkNetTermsEligibility({
      verificationStatus: ctx?.verificationStatus ?? null,
      creditStatus: ctx?.credit?.status ?? null,
      creditLimitFils: ctx?.credit?.creditLimitFils ?? 0,
      outstandingFils: ctx?.credit?.outstandingFils ?? 0,
      overdueCount: ctx?.overdueCount ?? 0,
      amountFils,
    });
  }

  /** Throws a 400 the buyer can act on when terms are not available. */
  assertEligible(ctx: BusinessContext | null, amountFils: number): void {
    const r = this.eligibility(ctx, amountFils);
    if (!r.ok) {
      throw new HttpError(400, BLOCK_MESSAGES[r.reason], `NET_TERMS_${r.reason.toUpperCase()}`);
    }
  }

  /**
   * Confirm a pending order on net terms. Idempotent: the order row is locked
   * first, and a second call finds the existing net-terms payment and returns
   * the same result without touching credit again.
   */
  async confirmOrder(orderId: string, userId: string, now = new Date()): Promise<ConfirmResult> {
    const result = await this.manager.transaction(async (m) => {
      const [order] = await m.query(
        `SELECT id, user_id, status, payment_status, grand_total, payment_terms, payment_due_at
           FROM orders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [orderId],
      );
      // notFound for another user's order: no existence oracle.
      if (!order || order.user_id !== userId) {
        throw new HttpError(404, "Order not found", "ORDER_NOT_FOUND");
      }

      const [existing] = await m.query(
        `SELECT id FROM payments WHERE order_id = $1 AND payment_method = 'net_terms'
            AND deleted_at IS NULL LIMIT 1`,
        [orderId],
      );
      if (existing) {
        return {
          status: "confirmed" as const,
          order_id: orderId,
          terms: order.payment_terms,
          payment_due_at: new Date(order.payment_due_at).toISOString(),
          idempotent: true,
        };
      }
      if (order.status !== "pending_payment" || order.payment_status === "captured") {
        throw new HttpError(409, "This order can no longer be paid", "ORDER_NOT_PAYABLE");
      }

      const ctx = await loadBusinessContext(m, userId);
      if (!ctx) throw new HttpError(400, BLOCK_MESSAGES.no_business, "NET_TERMS_NO_BUSINESS");
      // Lock the credit row, then re-check against the locked figures.
      const [credit] = await m.query(
        `SELECT id, status, terms, credit_limit_fils, outstanding_fils
           FROM business_credit_accounts WHERE business_account_id = $1 FOR UPDATE`,
        [ctx.businessAccountId],
      );
      const amount = Number(order.grand_total);
      const check = checkNetTermsEligibility({
        verificationStatus: ctx.verificationStatus,
        creditStatus: credit?.status ?? null,
        creditLimitFils: Number(credit?.credit_limit_fils ?? 0),
        outstandingFils: Number(credit?.outstanding_fils ?? 0),
        overdueCount: ctx.overdueCount,
        amountFils: amount,
      });
      if (!check.ok) {
        throw new HttpError(
          400,
          BLOCK_MESSAGES[check.reason],
          `NET_TERMS_${check.reason.toUpperCase()}`,
        );
      }

      const terms = credit.terms as "net_30" | "net_60";
      const dueAt = netTermsDueDate(now, terms);

      await m.query(
        `UPDATE business_credit_accounts
            SET outstanding_fils = outstanding_fils + $2, updated_at = now()
          WHERE id = $1`,
        [credit.id, amount],
      );
      await m.query(
        `INSERT INTO payments (order_id, user_id, status, payment_method, amount, currency, gateway, authorized_at)
         VALUES ($1, $2, 'authorized', 'net_terms', $3, 'AED', 'net_terms', $4)`,
        [orderId, userId, amount, now],
      );
      await m.query(
        `UPDATE orders
            SET status = 'confirmed', payment_status = 'authorized', payment_terms = $2,
                payment_due_at = $3, business_account_id = $4, updated_at = now()
          WHERE id = $1`,
        [orderId, terms, dueAt, ctx.businessAccountId],
      );
      await m.query(
        `UPDATE inventory_reservations SET status = 'committed', committed_at = now()
          WHERE order_id = $1 AND status = 'active'`,
        [orderId],
      );
      await m.query(
        `INSERT INTO order_status_history (order_id, from_status, to_status, comment, is_customer_visible)
         VALUES ($1, 'pending_payment', 'confirmed', $2, true)`,
        [orderId, `Confirmed on ${terms === "net_30" ? "net 30" : "net 60"} terms`],
      );
      return {
        status: "confirmed" as const,
        order_id: orderId,
        terms,
        payment_due_at: dueAt.toISOString(),
      };
    });

    if (!result.idempotent) {
      // Same committed-order side effects COD runs (checkout.service.ts).
      await this.sideEffects.recordCouponUsage(orderId);
      await this.sideEffects.clearCustomerCart(userId);
      await this.sideEffects.triggerAutoShipments(orderId);
      await this.sideEffects.emitOrderPlaced(orderId, userId);
    }
    return result;
  }

  /** Admin: the buyer paid. Idempotent. Frees the credit and marks invoices paid. */
  async markPaid(
    orderId: string,
    adminId: string,
    data: { reference: string; paid_at?: string },
  ): Promise<{ order_id: string; status: "paid"; idempotent?: boolean }> {
    const reference = data.reference?.trim();
    if (!reference) throw new HttpError(400, "Enter the payment reference", "FIELD_REQUIRED");
    const paidAt = data.paid_at ? new Date(`${data.paid_at}T12:00:00+04:00`) : new Date();
    if (Number.isNaN(paidAt.getTime()) || paidAt.getTime() > Date.now() + 24 * 3600 * 1000) {
      throw new HttpError(400, "Paid date must be today or earlier", "FIELD_INVALID");
    }

    return this.manager.transaction(async (m) => {
      const [order] = await m.query(
        `SELECT id, payment_terms, business_account_id FROM orders
          WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [orderId],
      );
      if (!order?.payment_terms) throw new HttpError(404, "Receivable not found", "NOT_FOUND");
      const [payment] = await m.query(
        `SELECT id, status, amount FROM payments
          WHERE order_id = $1 AND payment_method = 'net_terms' AND deleted_at IS NULL
          FOR UPDATE`,
        [orderId],
      );
      if (!payment) throw new HttpError(404, "Receivable not found", "NOT_FOUND");
      if (payment.status === "captured") {
        return { order_id: orderId, status: "paid" as const, idempotent: true };
      }
      if (payment.status !== "authorized") {
        throw new HttpError(409, `Payment is ${payment.status}`, "PAYMENT_NOT_OPEN");
      }

      await m.query(
        `UPDATE payments SET status = 'captured', captured_at = $2,
                gateway_transaction_id = $3, updated_at = now()
          WHERE id = $1`,
        [payment.id, paidAt, reference.slice(0, 255)],
      );
      await m.query(
        `UPDATE orders SET payment_status = 'captured', updated_at = now() WHERE id = $1`,
        [orderId],
      );
      await m.query(
        `UPDATE business_credit_accounts
            SET outstanding_fils = GREATEST(0, outstanding_fils - $2), updated_at = now()
          WHERE business_account_id = $1`,
        [order.business_account_id, Number(payment.amount)],
      );
      await m.query(
        `UPDATE tax_invoices SET payment_status = 'paid', paid_at = $2, pdf_s3_key = NULL, updated_at = now()
          WHERE order_id = $1 AND payment_status = 'unpaid'`,
        [orderId, paidAt],
      );
      await m.query(
        `INSERT INTO order_status_history (order_id, from_status, to_status, comment, is_customer_visible, changed_by)
         SELECT id, status, status, $2, true, $3 FROM orders WHERE id = $1`,
        [orderId, `Invoice paid (ref ${reference.slice(0, 80)})`, adminId],
      );
      return { order_id: orderId, status: "paid" as const };
    });
  }

  /**
   * Release the credit held by an unpaid net-terms order that was cancelled.
   * Safe to call for any order and more than once (no-op unless an
   * `authorized` net-terms payment exists).
   */
  async releaseForCancelledOrder(orderId: string): Promise<boolean> {
    return this.manager.transaction(async (m) => {
      const [payment] = await m.query(
        `SELECT p.id, p.amount, o.business_account_id FROM payments p
           JOIN orders o ON o.id = p.order_id
          WHERE p.order_id = $1 AND p.payment_method = 'net_terms' AND p.status = 'authorized'
            AND p.deleted_at IS NULL
          FOR UPDATE OF p`,
        [orderId],
      );
      if (!payment) return false;
      await m.query(`UPDATE payments SET status = 'cancelled', updated_at = now() WHERE id = $1`, [
        payment.id,
      ]);
      await m.query(
        `UPDATE business_credit_accounts
            SET outstanding_fils = GREATEST(0, outstanding_fils - $2), updated_at = now()
          WHERE business_account_id = $1`,
        [payment.business_account_id, Number(payment.amount)],
      );
      await m.query(
        `UPDATE tax_invoices SET payment_status = 'void', pdf_s3_key = NULL, updated_at = now()
          WHERE order_id = $1 AND payment_status = 'unpaid'`,
        [orderId],
      );
      return true;
    });
  }

  /** Admin receivables list. */
  async listReceivables(q: { status?: string; page?: number; limit?: number; q?: string }) {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
    const where: string[] = [
      "o.payment_terms IS NOT NULL",
      "o.deleted_at IS NULL",
      "p.payment_method = 'net_terms'",
      "p.status IN ('authorized', 'captured')",
    ];
    const params: unknown[] = [];
    if (q.status === "paid") where.push("p.status = 'captured'");
    else if (q.status === "overdue")
      where.push("p.status = 'authorized' AND o.payment_due_at < now()");
    else if (q.status === "due")
      where.push("p.status = 'authorized' AND o.payment_due_at >= now()");
    if (q.q?.trim()) {
      params.push(`%${q.q.trim()}%`);
      where.push(
        `(o.order_number ILIKE $${params.length} OR b.legal_name ILIKE $${params.length} OR b.trn LIKE $${params.length})`,
      );
    }
    const from = `FROM orders o
      JOIN payments p ON p.order_id = o.id AND p.deleted_at IS NULL
      LEFT JOIN business_accounts b ON b.id = o.business_account_id
      WHERE ${where.join(" AND ")}`;

    const [{ total }] = await this.manager.query(`SELECT COUNT(*)::int AS total ${from}`, params);
    const rows = await this.manager.query(
      `SELECT o.id AS order_id, o.order_number, o.business_account_id, b.legal_name, b.trn,
              o.payment_terms AS terms, p.amount AS amount_fils, p.authorized_at AS confirmed_at,
              o.payment_due_at AS due_at, p.status AS payment_status, p.captured_at AS paid_at,
              p.gateway_transaction_id AS payment_reference
         ${from}
        ORDER BY (p.status = 'captured') ASC, o.payment_due_at ASC
        LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
      params,
    );
    const orderIds = rows.map((r: ReceivableRow) => r.order_id);
    const invoices = orderIds.length
      ? await this.manager.query(
          `SELECT id, order_id, invoice_number, seller->>'legal_name' AS seller_name, payable_fils
             FROM tax_invoices WHERE order_id = ANY($1::uuid[]) ORDER BY invoice_number`,
          [orderIds],
        )
      : [];

    const now = new Date();
    const items = rows.map((r: ReceivableRow) => {
      const dueAt = r.due_at ? new Date(r.due_at) : null;
      const status = receivableStatus(r.payment_status, dueAt, now);
      return {
        order_id: r.order_id,
        order_number: r.order_number,
        business_account_id: r.business_account_id,
        legal_name: r.legal_name,
        trn: r.trn,
        terms: r.terms,
        amount_fils: Number(r.amount_fils),
        confirmed_at: r.confirmed_at,
        due_at: r.due_at,
        status,
        days_overdue: status === "overdue" && dueAt ? daysOverdue(dueAt, now) : 0,
        paid_at: r.paid_at,
        payment_reference: r.payment_reference,
        invoices: invoices
          .filter((i: ReceivableInvoiceRow) => i.order_id === r.order_id)
          .map((i: ReceivableInvoiceRow) => ({
            id: i.id,
            invoice_number: i.invoice_number,
            seller_name: i.seller_name,
            total_fils: Number(i.payable_fils),
          })),
      };
    });

    const [s] = await this.manager.query(
      `SELECT
         COUNT(*) FILTER (WHERE p.status = 'authorized' AND o.payment_due_at >= now())::int AS due_count,
         COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'authorized' AND o.payment_due_at >= now()), 0)::bigint AS due_fils,
         COUNT(*) FILTER (WHERE p.status = 'authorized' AND o.payment_due_at < now())::int AS overdue_count,
         COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'authorized' AND o.payment_due_at < now()), 0)::bigint AS overdue_fils,
         COUNT(*) FILTER (WHERE p.status = 'captured')::int AS paid_count,
         COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'captured'), 0)::bigint AS paid_fils
       FROM orders o JOIN payments p ON p.order_id = o.id AND p.deleted_at IS NULL
      WHERE o.payment_terms IS NOT NULL AND o.deleted_at IS NULL AND p.payment_method = 'net_terms'`,
    );
    const summary = {
      due_count: Number(s.due_count),
      due_fils: Number(s.due_fils),
      overdue_count: Number(s.overdue_count),
      overdue_fils: Number(s.overdue_fils),
      paid_count: Number(s.paid_count),
      paid_fils: Number(s.paid_fils),
    };
    return { items, total: Number(total), page, limit, summary };
  }
}
