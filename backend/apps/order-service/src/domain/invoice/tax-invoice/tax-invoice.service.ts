// tax-invoice.service.ts — creates and serves the VAT tax invoices of an
// order. Generation is idempotent (unique per vendor sub-order and per
// order for the platform invoice) and numbers are taken from
// invoice_number_sequences inside the same transaction as the insert.
import { config } from "@materialhub/config";
import {
  EInvoiceStatus,
  type InvoiceParty,
  type Order,
  type TaxInvoice,
  type TaxInvoiceKind,
  TaxInvoicePaymentStatus,
  type Vendor,
} from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";
import { isValidTrn, peppolIdFromTrn } from "@materialhub/utils";
import type { EntityManager, Repository } from "typeorm";
import { type EInvoiceTransmitter, NoopEInvoiceTransmitter } from "../einvoice/transmitter.ts";
import { buildUblInvoice } from "../einvoice/ubl.ts";
import {
  buildInvoiceDrafts,
  formatInvoiceNumber,
  partyAddress,
  sellerCodeFor,
  seriesFor,
} from "./tax-invoice-builder.ts";
import { renderTaxInvoicePdf } from "./tax-invoice-pdf.ts";

export interface InvoiceMedia {
  uploadBuffer(key: string, buffer: Buffer, contentType: string): Promise<void>;
  getReceiptSignedUrl(key: string): Promise<{ url: string; expiresAt: Date }>;
}

export function taxInvoicePdfKey(invoiceId: string): string {
  return `private/receipts/tax-invoices/${invoiceId}.pdf`;
}

/** Take the next number of a series. Must run inside the insert's transaction. */
export async function nextInvoiceSequence(m: EntityManager, series: string): Promise<number> {
  const [row] = await m.query(
    `INSERT INTO invoice_number_sequences (series, last_value, updated_at)
     VALUES ($1, 1, now())
     ON CONFLICT (series) DO UPDATE
       SET last_value = invoice_number_sequences.last_value + 1, updated_at = now()
     RETURNING last_value`,
    [series],
  );
  return Number(row.last_value);
}

export function platformParty(): InvoiceParty {
  const trn = config.invoice.trn && isValidTrn(config.invoice.trn) ? config.invoice.trn : null;
  return {
    legal_name: config.invoice.legalName,
    trn,
    peppol_id: peppolIdFromTrn(trn),
    registration_id: process.env.PLATFORM_TRADE_LICENCE || null,
    address: partyAddress({
      line1: process.env.PLATFORM_ADDRESS_LINE1 || null,
      city: process.env.PLATFORM_ADDRESS_CITY || "Dubai",
      emirate: process.env.PLATFORM_ADDRESS_EMIRATE || "Dubai",
      country_code: "AE",
    }),
  };
}

const ORDER_RELATIONS = ["vendorOrders", "vendorOrders.vendor", "vendorOrders.items", "user"];

type Json = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** The order graph generateForOrder loads (relations in ORDER_RELATIONS). */
type InvoiceOrder = Order & { user?: { email?: string | null } | null };

/** A tax_invoices row from a raw query, with the order number joined in. */
type RawInvoiceRow = TaxInvoice & { order_number: string; is_overdue?: boolean };

export class TaxInvoiceService {
  constructor(
    private invoiceRepo: Repository<TaxInvoice>,
    private orderRepo: Repository<Order>,
    private media: InvoiceMedia,
    private transmitter: EInvoiceTransmitter = new NoopEInvoiceTransmitter(),
  ) {}

  private buyerParty(order: InvoiceOrder): InvoiceParty {
    const b = (order.billing_address ?? {}) as Json;
    if (b.type === "business") {
      const trn = isValidTrn(str(b.trn)) ? str(b.trn) : null;
      return {
        legal_name: str(b.legal_name) ?? "Business customer",
        trade_name: str(b.trade_name),
        trn,
        peppol_id: str(b.peppol_participant_id) ?? peppolIdFromTrn(trn),
        registration_id: str(b.trade_licence_number),
        registration_issuer: str(b.trade_licence_issuer),
        email: order.user?.email ?? null,
        address: partyAddress(b),
      };
    }
    const a = (order.billing_address ?? order.shipping_address ?? {}) as Json;
    const name =
      str(a.full_name) ||
      [str(a.first_name), str(a.last_name)].filter(Boolean).join(" ").trim() ||
      "Customer";
    return {
      legal_name: name,
      trn: null,
      peppol_id: null,
      email: order.user?.email ?? null,
      address: partyAddress(a),
    };
  }

  private sellerParty(vendor: Partial<Vendor> | null | undefined): InvoiceParty {
    const v = vendor ?? {};
    const legacy = str(v.vat_number)?.replace(/\s/g, "") ?? null;
    const trn = isValidTrn(v.trn) ? (v.trn ?? null) : isValidTrn(legacy) ? legacy : null;
    return {
      legal_name: str(v.business_name) ?? str(v.name) ?? "Vendor",
      trade_name: v.name && v.name !== v.business_name ? v.name : null,
      trn,
      peppol_id: peppolIdFromTrn(trn),
      registration_id: v.trade_license_number ?? null,
      email: v.contact_email ?? null,
      address: partyAddress(v.address),
    };
  }

  /**
   * Create the order's tax invoices if they don't exist yet. Safe to call
   * repeatedly and concurrently: existing rows are skipped and the unique
   * indexes reject a racing duplicate (the loser's transaction rolls back,
   * so it does not burn an invoice number).
   */
  async generateForOrder(orderId: string, now = new Date()): Promise<TaxInvoice[]> {
    const order = (await this.orderRepo.findOne({
      where: { id: orderId },
      relations: ORDER_RELATIONS,
    })) as InvoiceOrder | null;
    if (!order) return [];
    const existing = await this.invoiceRepo.find({ where: { order_id: orderId } });
    const [payment] = await this.orderRepo.manager.query(
      `SELECT payment_method FROM payments WHERE order_id = $1 AND deleted_at IS NULL
         AND status IN ('authorized', 'captured', 'pending')
       ORDER BY (status = 'captured') DESC, created_at DESC LIMIT 1`,
      [orderId],
    );

    const sellers: Record<string, InvoiceParty> = {};
    for (const vo of order.vendorOrders ?? []) sellers[vo.vendor_id] = this.sellerParty(vo.vendor);
    const drafts = buildInvoiceDrafts({
      order,
      sellers,
      platform: platformParty(),
      buyer: this.buyerParty(order),
      paymentMethod: payment?.payment_method ?? null,
      issuedAt: now,
    });
    const year = Number(drafts[0]?.issue_date.slice(0, 4) ?? now.getUTCFullYear());
    const paid = order.payment_status === "captured";

    const created: TaxInvoice[] = [];
    for (const d of drafts) {
      const dup = existing.find((e) =>
        d.kind === "platform" ? e.kind === "platform" : e.vendor_order_id === d.vendor_order_id,
      );
      if (dup) continue;
      try {
        const row = await this.orderRepo.manager.transaction(async (m) => {
          const seq = await nextInvoiceSequence(m, seriesFor(d.vendor_id, year));
          const repo = m.getRepository(this.invoiceRepo.target);
          return repo.save({
            invoice_number: formatInvoiceNumber(sellerCodeFor(d.vendor_id), year, seq),
            kind: d.kind as TaxInvoiceKind,
            type_code: "380",
            order_id: d.order_id,
            vendor_order_id: d.vendor_order_id,
            vendor_id: d.vendor_id,
            buyer_user_id: d.buyer_user_id,
            business_account_id: d.business_account_id,
            issue_date: d.issue_date,
            supply_date: null,
            due_date: d.due_date,
            currency: d.currency,
            seller: d.seller,
            buyer: d.buyer,
            lines: d.lines,
            allowances_charges: d.allowances_charges,
            vat_breakdown: d.totals.vat_breakdown,
            line_extension_fils: d.totals.line_extension_fils,
            allowance_total_fils: d.totals.allowance_total_fils,
            charge_total_fils: d.totals.charge_total_fils,
            tax_exclusive_fils: d.totals.tax_exclusive_fils,
            vat_total_fils: d.totals.vat_total_fils,
            tax_inclusive_fils: d.totals.tax_inclusive_fils,
            rounding_fils: d.totals.rounding_fils,
            payable_fils: d.totals.payable_fils,
            payment_terms: d.payment_terms,
            payment_method: d.payment_method,
            payment_status: paid ? TaxInvoicePaymentStatus.paid : TaxInvoicePaymentStatus.unpaid,
            paid_at: paid ? now : null,
            einvoice_status: d.einvoice_status as EInvoiceStatus,
          });
        });
        created.push(row as TaxInvoice);
      } catch (err) {
        if ((err as { code?: string })?.code === "23505") continue; // a concurrent run created it
        throw err;
      }
    }

    for (const inv of created) await this.transmit(inv, order.order_number);
    return created;
  }

  /** Hand ready invoices to the ASP seam. Never throws. */
  private async transmit(inv: TaxInvoice, orderNumber: string): Promise<void> {
    if (inv.einvoice_status !== "ready") return;
    try {
      const res = await this.transmitter.submit({
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number,
        sellerTrn: inv.seller?.trn ?? null,
        buyerTrn: inv.buyer?.trn ?? null,
        xml: this.toXml(inv, orderNumber),
      });
      const patch: Partial<TaxInvoice> =
        res.status === "submitted"
          ? {
              einvoice_status: EInvoiceStatus.submitted,
              asp_message_id: res.messageId,
              asp_submitted_at: new Date(),
              asp_last_error: null,
            }
          : res.status === "rejected"
            ? { einvoice_status: EInvoiceStatus.rejected, asp_last_error: res.error }
            : { asp_last_error: res.reason };
      await this.invoiceRepo.update({ id: inv.id }, patch);
    } catch (err) {
      await this.invoiceRepo
        .update({ id: inv.id }, { asp_last_error: String(err) })
        .catch(() => {});
    }
  }

  toXml(inv: TaxInvoice, orderNumber?: string | null): string {
    return buildUblInvoice({ ...inv, order_reference: orderNumber ?? null });
  }

  // ── Access ───────────────────────────────────────────────────────────

  /**
   * Invoices the caller may see: their own orders', plus every invoice of
   * their business when they are an admin or approver of it.
   */
  private async visibleWhere(userId: string): Promise<{ sql: string; params: unknown[] }> {
    const [m] = await this.orderRepo.manager.query(
      `SELECT business_account_id, role FROM business_members
        WHERE user_id = $1 AND status = 'active' LIMIT 1`,
      [userId],
    );
    if (m && (m.role === "admin" || m.role === "approver")) {
      return {
        sql: "(t.buyer_user_id = $1 OR t.business_account_id = $2)",
        params: [userId, m.business_account_id],
      };
    }
    return { sql: "t.buyer_user_id = $1", params: [userId] };
  }

  async listForUser(userId: string, q: { status?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
    const vis = await this.visibleWhere(userId);
    const where = [vis.sql];
    if (q.status === "paid") where.push("t.payment_status = 'paid'");
    else if (q.status === "unpaid") where.push("t.payment_status = 'unpaid'");
    else if (q.status === "overdue")
      where.push(
        "t.payment_status = 'unpaid' AND t.due_date IS NOT NULL AND t.due_date < (now() AT TIME ZONE 'Asia/Dubai')::date",
      );
    const from = `FROM tax_invoices t JOIN orders o ON o.id = t.order_id WHERE ${where.join(" AND ")}`;
    const [{ total }] = await this.orderRepo.manager.query(
      `SELECT COUNT(*)::int AS total ${from}`,
      vis.params,
    );
    const rows: RawInvoiceRow[] = await this.orderRepo.manager.query(
      `SELECT t.*, o.order_number,
              (t.payment_status = 'unpaid' AND t.due_date IS NOT NULL
               AND t.due_date < (now() AT TIME ZONE 'Asia/Dubai')::date) AS is_overdue
         ${from}
        ORDER BY t.issue_date DESC, t.invoice_number DESC
        LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
      vis.params,
    );
    return {
      items: rows.map((r: RawInvoiceRow) => toInvoiceRow(normalizeDates(r))),
      total: Number(total),
      page,
      limit,
    };
  }

  private async findVisible(userId: string, id: string, isAdmin: boolean) {
    if (isAdmin) {
      const rows = await this.orderRepo.manager.query(
        "SELECT t.*, o.order_number FROM tax_invoices t JOIN orders o ON o.id = t.order_id WHERE t.id = $1",
        [id],
      );
      return rows[0] ? normalizeDates(rows[0]) : null;
    }
    const vis = await this.visibleWhere(userId);
    const rows = await this.orderRepo.manager.query(
      `SELECT t.*, o.order_number FROM tax_invoices t JOIN orders o ON o.id = t.order_id
        WHERE t.id = $${vis.params.length + 1} AND ${vis.sql}`,
      [...vis.params, id],
    );
    return rows[0] ? normalizeDates(rows[0]) : null;
  }

  async xmlFor(userId: string, id: string, isAdmin = false) {
    const inv = await this.findVisible(userId, id, isAdmin);
    if (!inv) throw new HttpError(404, "Invoice not found", "NOT_FOUND");
    return { filename: `${inv.invoice_number}.xml`, xml: this.toXml(inv, inv.order_number) };
  }

  async pdfUrlFor(userId: string, id: string, isAdmin = false) {
    const inv = await this.findVisible(userId, id, isAdmin);
    if (!inv) throw new HttpError(404, "Invoice not found", "NOT_FOUND");
    // pdf_s3_key is cleared whenever the payment status changes (net-terms
    // mark-paid / cancellation), so a stored key is always current.
    let key: string | null = inv.pdf_s3_key;
    if (!key) {
      const pdf = await renderTaxInvoicePdf(inv, inv.order_number);
      key = taxInvoicePdfKey(inv.id);
      await this.media.uploadBuffer(key, pdf, "application/pdf");
      await this.invoiceRepo.update({ id: inv.id }, { pdf_s3_key: key });
    }
    const { url } = await this.media.getReceiptSignedUrl(key);
    return { url };
  }
}

export function toInvoiceRow(t: RawInvoiceRow) {
  return {
    id: t.id,
    invoice_number: t.invoice_number,
    kind: t.kind,
    order_id: t.order_id,
    order_number: t.order_number,
    seller_name: t.seller?.legal_name ?? null,
    seller_trn: t.seller?.trn ?? null,
    buyer_name: t.buyer?.legal_name ?? null,
    buyer_trn: t.buyer?.trn ?? null,
    issue_date: typeof t.issue_date === "string" ? t.issue_date : isoDay(t.issue_date),
    due_date: t.due_date
      ? typeof t.due_date === "string"
        ? t.due_date
        : isoDay(t.due_date)
      : null,
    payment_terms: t.payment_terms,
    payment_status: t.payment_status,
    is_overdue: Boolean(t.is_overdue),
    taxable_fils: Number(t.tax_exclusive_fils),
    vat_fils: Number(t.vat_total_fils),
    total_fils: Number(t.payable_fils),
    currency: t.currency,
    einvoice_status: t.einvoice_status,
  };
}

function isoDay(d: Date | null): string | null {
  if (!d) return null;
  const x = new Date(d);
  // node-postgres parses DATE columns as local midnight; use local parts.
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

/** Raw-query rows carry DATE columns as Date objects; the XML/PDF want YYYY-MM-DD. */
export function normalizeDates<T extends object>(row: T): T {
  const out: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const k of ["issue_date", "due_date", "supply_date"]) {
    if (out[k] instanceof Date) out[k] = isoDay(out[k]);
  }
  return out as T;
}
