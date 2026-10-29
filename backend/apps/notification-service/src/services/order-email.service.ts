import type { EmailService } from "@materialhub/utils";
import {
  type CustomerOrderEmailData,
  type EmailLineItem,
  type ItemsCancelledLineItem,
  type VendorOrderEmailData,
  renderCustomerOrderEmail,
  renderItemsCancelledEmail,
  renderVendorOrderEmail,
} from "../domain/order-email-templates.ts";

// Human labels for the payment gateway stored on the Payment row.
const PAYMENT_LABELS: Record<string, string> = {
  stripe: "Card",
  card: "Card",
  cod: "Cash on Delivery",
  cash_on_delivery: "Cash on Delivery",
  tabby: "Tabby",
  tamara: "Tamara",
  checkout: "Card",
};

// Minimal structural view of a TypeORM repository — only the read methods this
// service needs. Avoids a direct `typeorm` dependency in notification-service.
interface ReadRepo {
  findOne(opts: any): Promise<any>;
  find(opts: any): Promise<any[]>;
}

function toEmailItem(oi: any): EmailLineItem {
  return {
    product_name: oi.product_name,
    variant_name: oi.variant_name,
    product_image_url: oi.product_image_url,
    quantity: oi.quantity,
    line_total: oi.line_total,
  };
}

/**
 * Sends the two transactional emails that fire when an order is placed:
 *  1. an order confirmation to the customer, and
 *  2. a new-order alert to every vendor with items in the order.
 *
 * Triggered once per order from the notification event consumer on the
 * `order.status.changed → confirmed` event. That event is emitted by the
 * order-service both from `markOrderPaid` (prepaid: Stripe/BNPL, after payment
 * capture) and from the COD checkout path (at placement — COD has no webhook).
 * So a vendor is only ever told to fulfil an order that is genuinely committed.
 *
 * These are transactional emails and intentionally bypass the per-user
 * notification-preference gate (a customer can't opt out of their own order
 * receipt). Every send is best-effort: one failed address never blocks another.
 */
// Vendor-member roles that receive the operational new-order alert. Viewers
// are read-only and intentionally excluded — the email is a fulfilment prompt.
const NOTIFY_MEMBER_ROLES = new Set(["owner", "manager", "staff"]);

// site_settings key holding the internal ops inbox for new-order notifications.
// Managed from the admin Settings page (general group); blank = disabled.
const OPS_EMAIL_SETTING_KEY = "order_ops_notification_email";

export class OrderEmailService {
  constructor(
    private readonly orderRepo: ReadRepo,
    private readonly orderItemRepo: ReadRepo,
    private readonly vendorOrderRepo: ReadRepo,
    private readonly vendorRepo: ReadRepo,
    private readonly vendorMemberRepo: ReadRepo,
    private readonly userRepo: ReadRepo,
    private readonly paymentRepo: ReadRepo,
    private readonly siteSettingRepo: ReadRepo,
    private readonly emailService: EmailService,
    private readonly cancellationRepo: ReadRepo,
  ) {}

  async sendForConfirmedOrder(orderId: string): Promise<void> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) {
      console.warn("[order-email] order not found, skipping", { orderId });
      return;
    }

    const payment = await this.paymentRepo.findOne({
      where: { order_id: orderId },
      order: { created_at: "DESC" } as any,
    });
    const gateway = String(payment?.gateway ?? "").toLowerCase();
    const isCod = gateway === "cod" || gateway === "cash_on_delivery";
    const paymentLabel = PAYMENT_LABELS[gateway] ?? "Card";

    const items = await this.orderItemRepo.find({
      where: { order_id: orderId },
      order: { created_at: "ASC" } as any,
    });

    await this.sendCustomerEmail(order, items, { isCod, paymentLabel }).catch((err) =>
      console.error("[order-email] customer send failed", { orderId, error: String(err) }),
    );

    await this.sendVendorEmails(order, items, { isCod }).catch((err) =>
      console.error("[order-email] vendor send failed", { orderId, error: String(err) }),
    );
  }

  /**
   * Notifies the customer when an admin cancels one or more items from their
   * order (partial cancellation, e.g. out-of-stock). Fired from the
   * notification event consumer on `order.items_cancelled`, emitted by the
   * order-service once the cancellation + refund/credit has been recorded.
   * Best-effort — one missing row or bad address never blocks anything else.
   */
  async sendForItemsCancelled(cancellationId: string): Promise<void> {
    const cancellation = await this.cancellationRepo.findOne({ where: { id: cancellationId } });
    if (!cancellation) {
      console.warn("[order-email] cancellation not found, skipping", { cancellationId });
      return;
    }

    const order = await this.orderRepo.findOne({ where: { id: cancellation.order_id } });
    if (!order) {
      console.warn("[order-email] order not found for cancellation, skipping", {
        cancellationId,
        orderId: cancellation.order_id,
      });
      return;
    }

    const user = await this.userRepo.findOne({ where: { id: order.user_id } });
    if (!user?.email) {
      console.warn("[order-email] no customer email, skipping cancellation email", {
        orderId: order.id,
      });
      return;
    }

    // Fetch by order_id (not a per-id OR query) so this works against both the
    // real TypeORM repo and simple structural test doubles alike.
    const orderItems = await this.orderItemRepo.find({ where: { order_id: order.id } });
    const byId = new Map(orderItems.map((oi: any) => [oi.id, oi]));

    const items: ItemsCancelledLineItem[] = cancellation.items.map((ci: any) => {
      const oi = byId.get(ci.order_item_id);
      return {
        product_name: oi?.product_name ?? "Item",
        variant_name: oi?.variant_name ?? null,
        quantity: ci.quantity,
        refund_amount: ci.refund_amount,
      };
    });

    const email = renderItemsCancelledEmail({
      orderNumber: order.order_number,
      customerName: user.first_name || null,
      currency: cancellation.currency || "AED",
      items,
      refundAmount: cancellation.refund_amount,
      refundMethod: cancellation.refund_method,
    });

    await this.emailService.sendTransactional(user.email, email.subject, email.html, email.text);
  }

  private async sendCustomerEmail(
    order: any,
    items: any[],
    ctx: { isCod: boolean; paymentLabel: string },
  ): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: order.user_id } });

    const data: CustomerOrderEmailData = {
      orderNumber: order.order_number,
      orderId: order.id,
      customerName: user?.first_name || null,
      currency: order.currency || "AED",
      items: items.map(toEmailItem),
      subtotal: order.subtotal ?? 0,
      discountTotal: order.discount_total ?? 0,
      shippingTotal: order.shipping_total ?? 0,
      surchargeTotal: order.surcharge_total ?? 0,
      taxTotal: order.tax_total ?? 0,
      grandTotal: order.grand_total ?? 0,
      paymentLabel: ctx.paymentLabel,
      isCod: ctx.isCod,
      shippingAddress: order.shipping_address ?? null,
    };

    const email = renderCustomerOrderEmail(data);

    if (user?.email) {
      await this.emailService.sendTransactional(user.email, email.subject, email.html, email.text);
    } else {
      console.warn("[order-email] no customer email, skipping customer copy", {
        orderId: order.id,
      });
    }

    await this.sendOpsCopy(order, email, data, ctx.paymentLabel);
  }

  /**
   * Internal heads-up so the platform is notified of every placed order. Reuses
   * the full customer order layout (all line items, totals, address) with a
   * distinct `[New Order] …` subject, sent to the ops inbox configured via
   * ORDER_OPS_EMAIL. Skipped when unset; fires regardless of whether the
   * customer had a deliverable email; best-effort so it never blocks anything.
   */
  private async sendOpsCopy(
    order: any,
    email: { subject: string; html: string; text: string },
    data: CustomerOrderEmailData,
    paymentLabel: string,
  ): Promise<void> {
    const setting = await this.siteSettingRepo.findOne({
      where: { key: OPS_EMAIL_SETTING_KEY },
    });
    const ops = (setting?.value ?? "").trim();
    if (!ops) return;

    const total = (data.grandTotal / 100).toFixed(2);
    const subject = `[New Order] ${data.orderNumber} — ${data.currency} ${total} (${paymentLabel})`;
    await this.emailService.sendTransactional(ops, subject, email.html, email.text).catch((err) =>
      console.error("[order-email] ops copy send failed", {
        orderId: order.id,
        error: String(err),
      }),
    );
  }

  private async sendVendorEmails(order: any, items: any[], ctx: { isCod: boolean }): Promise<void> {
    const vendorOrders = await this.vendorOrderRepo.find({ where: { order_id: order.id } });
    if (vendorOrders.length === 0) return;

    // Group items by their vendor_order so each vendor only sees their own lines.
    const itemsByVendorOrder = new Map<string, any[]>();
    for (const it of items) {
      const list = itemsByVendorOrder.get(it.vendor_order_id) ?? [];
      list.push(it);
      itemsByVendorOrder.set(it.vendor_order_id, list);
    }

    for (const vo of vendorOrders) {
      const vendor = await this.vendorRepo.findOne({ where: { id: vo.vendor_id } });
      const recipients = await this.resolveVendorRecipients(vo.vendor_id, vendor?.contact_email);
      if (recipients.length === 0) {
        console.warn("[order-email] no vendor recipients, skipping", {
          vendorId: vo.vendor_id,
          vendorOrderId: vo.id,
        });
        continue;
      }

      const voItems = itemsByVendorOrder.get(vo.id) ?? [];
      const data: VendorOrderEmailData = {
        vendorName: vendor?.name || vendor?.business_name || "your store",
        vendorOrderNumber: vo.vendor_order_number,
        masterOrderNumber: order.order_number,
        currency: vo.currency || order.currency || "AED",
        items: voItems.map(toEmailItem),
        subtotal: vo.subtotal ?? 0,
        isCod: ctx.isCod,
        processingDeadline: vo.processing_deadline ?? null,
        shippingAddress: order.shipping_address ?? null,
      };

      const email = renderVendorOrderEmail(data);
      // One send per recipient — each best-effort so one bad address never
      // blocks the rest of the vendor's team (or the next vendor).
      for (const to of recipients) {
        await this.emailService
          .sendTransactional(to, email.subject, email.html, email.text)
          .catch((err) =>
            console.error("[order-email] one vendor send failed", {
              vendorOrderId: vo.id,
              to,
              error: String(err),
            }),
          );
      }
    }
  }

  /**
   * The recipient list for a vendor's new-order alert: the vendor's primary
   * `contact_email` plus every active team member in a fulfilment role
   * (owner / manager / staff), deduped case-insensitively. Viewers and
   * pending/revoked members are excluded. Falls back to whichever source has
   * addresses, so a vendor with no members still gets the contact_email and a
   * vendor with no contact_email still reaches its team.
   */
  private async resolveVendorRecipients(
    vendorId: string,
    contactEmail: string | null | undefined,
  ): Promise<string[]> {
    const byKey = new Map<string, string>();
    const add = (raw: string | null | undefined) => {
      const email = (raw ?? "").trim();
      if (!email) return;
      const key = email.toLowerCase();
      if (!byKey.has(key)) byKey.set(key, email);
    };

    add(contactEmail);

    const members = await this.vendorMemberRepo.find({
      where: { vendor_id: vendorId, status: "active" },
    });
    for (const m of members) {
      if (NOTIFY_MEMBER_ROLES.has(String(m.role))) add(m.email);
    }

    return [...byKey.values()];
  }
}
