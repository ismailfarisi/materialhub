// order-approval.service.ts — a buyer's order above the business approval
// limit needs an approver's sign-off before checkout.
//
// The flow, kept deliberately simple:
//   1. Buyer's cart total > approval_threshold_fils → checkout answers
//      403 APPROVAL_REQUIRED.
//   2. Buyer sends the cart for approval: we snapshot items, prices and total,
//      plus the cart hash (same hash the checkout quote uses).
//   3. An approver or admin approves or rejects.
//   4. An approval is valid for 72 hours for exactly that cart (same hash).
//      Placing the order consumes it (status `used`, order_id set).
import {
  type ApprovalItemSnapshot,
  type BusinessOrderApproval,
  OrderApprovalStatus,
} from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";
import type { EntityManager, Repository } from "typeorm";
import type { CartService } from "../cart/cart.service.ts";
import { type CartHashItem, computeCartHash } from "../checkout/quote/cart-hash.ts";
import { type BusinessContext, loadBusinessContext, needsApproval } from "./business-context.ts";

export const APPROVAL_VALIDITY_MS = 72 * 60 * 60 * 1000;

/** The cart line fields approvals read (CartService.getCart item shape). */
export interface ApprovalCartLine {
  product_id: string;
  variant_id?: string | null;
  vendor_id?: string | null;
  quantity: number;
  unit_price: number;
  line_total?: number;
  product_name?: string;
  vendor_name?: string;
  product?: { name?: string } | null;
  variant?: { name?: string } | null;
  vendor?: { business_name?: string; name?: string } | null;
}

interface UserRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

export function cartHashFor(items: ApprovalCartLine[]): string {
  return computeCartHash(
    items.map<CartHashItem>((it) => ({
      product_id: it.product_id,
      variant_id: it.variant_id ?? null,
      quantity: it.quantity,
      unit_price: it.unit_price,
    })),
  );
}

/** Approval states as the buyer should see them (pending/approved can lapse). */
export function effectiveApprovalStatus(
  a: { status: string; expires_at: Date | string | null },
  now: Date = new Date(),
): string {
  if (
    a.status === "approved" &&
    a.expires_at &&
    new Date(a.expires_at).getTime() <= now.getTime()
  ) {
    return "expired";
  }
  return a.status;
}

/** Can this approval be used to place an order for this cart right now? */
export function approvalMatches(
  a: { status: string; expires_at: Date | string | null; cart_hash: string; requested_by: string },
  cartHash: string,
  userId: string,
  now: Date = new Date(),
): boolean {
  return (
    effectiveApprovalStatus(a, now) === "approved" &&
    a.cart_hash === cartHash &&
    a.requested_by === userId
  );
}

export class OrderApprovalService {
  constructor(
    private approvalRepo: Repository<BusinessOrderApproval>,
    private cartService: CartService,
  ) {}

  private get manager(): EntityManager {
    return this.approvalRepo.manager;
  }

  private async requireContext(userId: string): Promise<BusinessContext> {
    const ctx = await loadBusinessContext(this.manager, userId);
    if (!ctx) throw new HttpError(404, "You are not part of a business account", "NO_BUSINESS");
    return ctx;
  }

  private canDecide(ctx: BusinessContext) {
    return ctx.role === "admin" || ctx.role === "approver";
  }

  private async view(rows: BusinessOrderApproval[], ctx: BusinessContext, userId: string) {
    const userIds = [
      ...new Set(rows.flatMap((r) => [r.requested_by, r.decided_by].filter(Boolean) as string[])),
    ];
    const users: UserRow[] = userIds.length
      ? await this.manager.query(
          "SELECT id, email, first_name, last_name FROM users WHERE id = ANY($1::uuid[])",
          [userIds],
        )
      : [];
    const orderIds = rows.map((r) => r.order_id).filter(Boolean) as string[];
    const orders: Array<{ id: string; order_number: string }> = orderIds.length
      ? await this.manager.query("SELECT id, order_number FROM orders WHERE id = ANY($1::uuid[])", [
          orderIds,
        ])
      : [];
    const person = (id: string | null) => {
      const u = id ? users.find((x) => x.id === id) : null;
      if (!u) return null;
      const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || null;
      return { id: u.id, name, email: u.email };
    };
    const now = new Date();
    return rows.map((r) => {
      const status = effectiveApprovalStatus(r, now);
      return {
        id: r.id,
        status,
        amount_fils: r.amount_fils,
        currency: r.currency,
        item_count: r.items_snapshot.reduce((s, i) => s + i.quantity, 0),
        items: r.items_snapshot.map((i) => ({
          product_name: i.product_name,
          variant_name: i.variant_name,
          vendor_name: i.vendor_name,
          quantity: i.quantity,
          unit_price_fils: i.unit_price_fils,
          line_total_fils: i.line_total_fils,
        })),
        note: r.note,
        requested_by: person(r.requested_by),
        decided_by: person(r.decided_by),
        decision_note: r.decision_note,
        created_at: r.created_at,
        decided_at: r.decided_at,
        expires_at: r.expires_at,
        order_id: r.order_id,
        order_number: orders.find((o) => o.id === r.order_id)?.order_number ?? null,
        can_decide: status === "pending" && this.canDecide(ctx) && r.requested_by !== userId,
      };
    });
  }

  /** POST /checkout/approvals — snapshot the caller's cart. */
  async request(userId: string, note?: string | null) {
    const ctx = await this.requireContext(userId);
    const { cart, items } = await this.cartService.getCart(userId, null);
    const all = (items ?? []).flatMap(
      (g: { items: ApprovalCartLine[] }) => g.items,
    ) as ApprovalCartLine[];
    if (!cart || all.length === 0) throw new HttpError(400, "Cart is empty", "CART_EMPTY");
    // Approval is for the goods total; shipping is added at checkout.
    const c = cart as { subtotal?: number; coupon_discount?: number };
    const amount = Number(c.subtotal ?? 0) - Number(c.coupon_discount ?? 0);
    if (!needsApproval(ctx, amount)) {
      throw new HttpError(400, "This order doesn't need approval", "APPROVAL_NOT_NEEDED");
    }
    const hash = cartHashFor(all);
    const open = await this.approvalRepo.findOne({
      where: { requested_by: userId, cart_hash: hash, status: OrderApprovalStatus.pending },
    });
    if (open) return (await this.view([open], ctx, userId))[0];

    const snapshot: ApprovalItemSnapshot[] = all.map((it) => ({
      product_id: it.product_id,
      variant_id: it.variant_id ?? null,
      product_name: it.product?.name ?? it.product_name ?? "Item",
      variant_name: it.variant?.name ?? null,
      vendor_id: it.vendor_id ?? null,
      vendor_name: it.vendor?.business_name ?? it.vendor?.name ?? it.vendor_name ?? null,
      quantity: it.quantity,
      unit_price_fils: it.unit_price,
      line_total_fils: it.line_total ?? it.unit_price * it.quantity,
    }));
    const saved = await this.approvalRepo.save({
      business_account_id: ctx.businessAccountId,
      requested_by: userId,
      cart_hash: hash,
      amount_fils: amount,
      currency: "AED",
      items_snapshot: snapshot,
      note: note?.trim()?.slice(0, 1000) || null,
      status: OrderApprovalStatus.pending,
    });
    return (await this.view([saved as BusinessOrderApproval], ctx, userId))[0];
  }

  async list(userId: string, status?: string) {
    const ctx = await this.requireContext(userId);
    const qb = this.approvalRepo
      .createQueryBuilder("a")
      .where("a.business_account_id = :b", { b: ctx.businessAccountId })
      .orderBy("a.created_at", "DESC")
      .take(100);
    if (!this.canDecide(ctx)) qb.andWhere("a.requested_by = :u", { u: userId });
    if (status === "pending") qb.andWhere("a.status = 'pending'");
    else if (status === "approved")
      qb.andWhere("a.status = 'approved' AND (a.expires_at IS NULL OR a.expires_at > now())");
    else if (status === "expired")
      qb.andWhere("(a.status = 'expired' OR (a.status = 'approved' AND a.expires_at <= now()))");
    else if (status) qb.andWhere("a.status = :s", { s: status });
    return this.view(await qb.getMany(), ctx, userId);
  }

  async decide(
    userId: string,
    id: string,
    decision: "approved" | "rejected",
    note?: string | null,
  ) {
    const ctx = await this.requireContext(userId);
    if (!this.canDecide(ctx)) {
      throw new HttpError(403, "Only approvers and admins can decide", "BUSINESS_ROLE_REQUIRED");
    }
    const row = await this.manager.transaction(async (m) => {
      const repo = m.getRepository(this.approvalRepo.target);
      const a = (await repo.findOne({
        where: { id, business_account_id: ctx.businessAccountId },
        lock: { mode: "pessimistic_write" },
      })) as BusinessOrderApproval | null;
      if (!a) throw new HttpError(404, "Approval request not found", "NOT_FOUND");
      if (a.requested_by === userId) {
        throw new HttpError(403, "You can't approve your own request", "SELF_APPROVAL");
      }
      if (a.status !== "pending") {
        throw new HttpError(409, `This request is already ${a.status}`, "APPROVAL_CLOSED");
      }
      const now = new Date();
      a.status = decision as OrderApprovalStatus;
      a.decided_by = userId;
      a.decided_at = now;
      a.decision_note = note?.trim()?.slice(0, 1000) || null;
      a.expires_at =
        decision === "approved" ? new Date(now.getTime() + APPROVAL_VALIDITY_MS) : null;
      return repo.save(a);
    });
    return (await this.view([row as BusinessOrderApproval], ctx, userId))[0];
  }

  async cancel(userId: string, id: string) {
    const ctx = await this.requireContext(userId);
    const a = await this.approvalRepo.findOne({
      where: { id, requested_by: userId },
    });
    if (!a) throw new HttpError(404, "Approval request not found", "NOT_FOUND");
    if (a.status !== "pending" && a.status !== "approved") {
      throw new HttpError(409, `This request is already ${a.status}`, "APPROVAL_CLOSED");
    }
    a.status = OrderApprovalStatus.cancelled;
    await this.approvalRepo.save(a);
    return (await this.view([a], ctx, userId))[0];
  }

  /** The approval (if any) the quote should show for this cart. */
  async latestForCart(userId: string, cartHash: string) {
    const a = await this.approvalRepo.findOne({
      where: { requested_by: userId, cart_hash: cartHash },
      order: { created_at: "DESC" },
    });
    if (!a || a.status === "used" || a.status === "cancelled") return null;
    return { id: a.id, status: effectiveApprovalStatus(a) };
  }

  /**
   * Checkout gate. Returns null when no approval is needed, or the id of the
   * approval that was atomically reserved (status → used) for this order.
   * Call `attachOrder` after the order exists, or `release` if creation fails.
   */
  async reserveForCheckout(
    ctx: BusinessContext | null,
    userId: string,
    cartItems: ApprovalCartLine[],
    amountFils: number,
  ): Promise<string | null> {
    if (!needsApproval(ctx, amountFils)) return null;
    const hash = cartHashFor(cartItems);
    // A raw UPDATE ... RETURNING resolves to [rows, rowCount] in TypeORM's
    // Postgres driver, not to rows. Destructuring `[row]` took the rows
    // ARRAY, which is truthy even when empty, so the 403 below never fired
    // and `row.id` was undefined (the approval was never linked to its order).
    const [rows] = await this.manager.query(
      `UPDATE business_order_approvals SET status = 'used', updated_at = now()
        WHERE id = (
          SELECT id FROM business_order_approvals
           WHERE requested_by = $1 AND cart_hash = $2 AND status = 'approved'
             AND expires_at > now()
           ORDER BY decided_at DESC LIMIT 1
           FOR UPDATE SKIP LOCKED)
        RETURNING id`,
      [userId, hash],
    );
    const row = (rows as Array<{ id: string }> | undefined)?.[0];
    if (!row) {
      throw new HttpError(
        403,
        `Orders above AED ${((ctx?.approvalThresholdFils ?? 0) / 100).toFixed(2)} need approval from your company`,
        "APPROVAL_REQUIRED",
      );
    }
    return row.id as string;
  }

  async attachOrder(approvalId: string, orderId: string): Promise<void> {
    await this.manager.query(
      "UPDATE business_order_approvals SET order_id = $2, updated_at = now() WHERE id = $1",
      [approvalId, orderId],
    );
  }

  async release(approvalId: string): Promise<void> {
    await this.manager.query(
      `UPDATE business_order_approvals SET status = 'approved', updated_at = now()
        WHERE id = $1 AND status = 'used' AND order_id IS NULL`,
      [approvalId],
    );
  }
}
