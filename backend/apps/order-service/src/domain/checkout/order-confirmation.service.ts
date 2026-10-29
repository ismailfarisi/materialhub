// order-confirmation.service.ts
import type { InventoryReservation, Order, OrderStatusHistory } from "@materialhub/database";
import type { Queue } from "bullmq";
import type { Repository } from "typeorm";
import type { CartService } from "../cart/cart.service.ts";
import { publishOrderPaidForAffiliates } from "../order/affiliate-commission-events.ts";
import { publishOrderPaidForChannels } from "../order/channel-conversion-events.ts";
import { publishOrderPaidForCommissions } from "../order/reels-commission-events.ts";
import type { CouponService } from "./coupon.service.ts";

/**
 * Single sink for "order has been paid" side effects. Every prepaid provider's
 * webhook (Stripe today, Tabby / Tamara / Checkout.com tomorrow) routes
 * through `markOrderPaid` so the bundle of side effects — order status flip,
 * inventory commit, status history, cart clear, commission publish — lives in
 * exactly one place. Adding a new provider means calling this method from its
 * webhook handler, nothing else.
 *
 * COD orders have no async confirmation but the customer is committed the
 * moment they pick the payment method, so the COD path calls
 * `clearCustomerCart` directly without flipping the order status.
 */
export class OrderConfirmationService {
  constructor(
    private orderRepo: Repository<Order>,
    private reservationRepo: Repository<InventoryReservation>,
    private statusHistoryRepo: Repository<OrderStatusHistory>,
    private cartService: CartService,
    // Books carrier shipments for the order's vendor sub-orders. Vendor
    // sub-orders are created already 'confirmed' (no transition event fires),
    // so payment confirmation is the only reliable booking trigger.
    private enqueueAutoShipments?: ((orderId: string) => Promise<void>) | null,
    // order-events queue. A master-level 'confirmed' event is emitted here so
    // the notification-service sends the order-placed emails (customer +
    // vendors). Master-level (no vendorOrderId) so the order-event bridge does
    // NOT re-trigger auto-shipment — that's already handled above.
    private orderEventQueue?: Queue | null,
    private couponService?: CouponService | null,
    // Enqueues receipt-PDF generation for the placed order. Best-effort; a
    // failure here must never block the order flow. Both prepaid (markOrderPaid)
    // and COD (checkout path) reach emitOrderPlaced, so this covers both.
    private invoiceQueue?: Queue | null,
  ) {}

  /**
   * Count the order's coupon redemption (usage row + usage_count increment).
   * Fired only for committed orders: prepaid via `markOrderPaid`, COD from the
   * checkout path — never at order creation, so an abandoned pending_payment
   * order never burns a usage. Best-effort and idempotent per order.
   */
  async recordCouponUsage(orderId: string): Promise<void> {
    if (!this.couponService) return;
    try {
      const order = await this.orderRepo.findOne({ where: { id: orderId } as any });
      const couponId = (order as any)?.coupon_id;
      if (!order || !couponId) return;
      await this.couponService.recordUsage(
        couponId,
        (order as any).user_id,
        orderId,
        (order as any).coupon_discount ?? 0,
      );
    } catch (err) {
      console.error("[order-confirmation] coupon usage record failed", {
        orderId,
        error: String(err),
      });
    }
  }

  /**
   * Emit a master-level `order.status.changed → confirmed` event so downstream
   * consumers (notification-service) know the order is placed & committed. Both
   * prepaid confirmation (`markOrderPaid`) and the COD checkout path call this,
   * so a vendor is only ever emailed about an order that will actually ship.
   * Best-effort — a queue failure must never block the order flow.
   */
  async emitOrderPlaced(orderId: string, userId?: string | null): Promise<void> {
    if (this.orderEventQueue) {
      try {
        await this.orderEventQueue.add("order.status.changed", {
          type: "order.status.changed",
          orderId,
          fromStatus: "pending_payment",
          toStatus: "confirmed",
          actorId: userId ?? "system",
          actorRole: "system",
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        console.error("[order-confirmation] order placed event emit failed", {
          orderId,
          error: String(err),
        });
      }
    }

    // Independent of the order-event enqueue above — a failure (or absence)
    // of one queue must never skip the other.
    if (this.invoiceQueue) {
      try {
        await this.invoiceQueue.add("generate", { orderId }, { jobId: `invoice_${orderId}` });
      } catch (err) {
        console.error("[order-confirmation] invoice enqueue failed", {
          orderId,
          error: String(err),
        });
      }
    }
  }

  async markOrderPaid(orderId: string): Promise<{ confirmed: boolean }> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } as any });
    if (!order) {
      return { confirmed: false };
    }

    // Idempotency keys on payment capture, NOT order status. A provider webhook
    // (Stripe/BNPL) can be delayed and arrive AFTER fulfilment has already moved
    // the master order past `pending_payment` — vendor sub-orders are created
    // `confirmed`, and an aggregation bumps the master to `processing`. Guarding
    // on `status === "pending_payment"` meant that race silently returned here,
    // stranding `payment_status` at `pending` and skipping the order-placed
    // emails (customer + per-vendor). Guarding on `payment_status` instead means
    // the capture and its side effects still fire exactly once, whatever status
    // fulfilment has since reached.
    if ((order as any).payment_status === "captured") {
      return { confirmed: false };
    }

    const previousStatus = (order as any).status;
    // Only advance to `confirmed` from the initial awaiting-payment state. If
    // fulfilment already moved the order further along, keep that more-advanced
    // status rather than regressing it.
    if (previousStatus === "pending_payment") {
      (order as any).status = "confirmed";
    }
    (order as any).payment_status = "captured";
    await this.orderRepo.save(order);

    const reservations = await this.reservationRepo.find({
      where: { order_id: orderId, status: "active" } as any,
    });
    for (const res of reservations) {
      (res as any).status = "committed";
      (res as any).committed_at = new Date();
      await this.reservationRepo.save(res);
    }

    await this.statusHistoryRepo.save({
      order_id: orderId,
      from_status: previousStatus,
      to_status: (order as any).status,
      comment: "Payment confirmed",
      is_customer_visible: true,
    } as any);

    await this.recordCouponUsage(orderId);

    await this.clearCustomerCart((order as any).user_id);

    publishOrderPaidForCommissions(orderId).catch((err) => {
      console.error("[order-confirmation] reels paid publish failed", {
        orderId,
        error: String(err),
      });
    });

    publishOrderPaidForAffiliates(orderId).catch((err) => {
      console.error("[affiliate-events] publishOrderPaidForAffiliates failed", {
        orderId,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    publishOrderPaidForChannels(orderId).catch((err) => {
      console.error("[order-confirmation] channel conversion publish failed", {
        orderId,
        error: String(err),
      });
    });

    await this.triggerAutoShipments(orderId);

    // Prepaid (Stripe/BNPL) order-placed emails fire here — after payment is
    // captured, never at order creation. COD emits from the checkout path.
    await this.emitOrderPlaced(orderId, (order as any).user_id);

    return { confirmed: true };
  }

  /**
   * Enqueue carrier booking for the order's vendor sub-orders. Failures are
   * swallowed — the admin retry-shipment endpoint is the recovery path.
   */
  async triggerAutoShipments(orderId: string): Promise<void> {
    if (!this.enqueueAutoShipments) return;
    try {
      await this.enqueueAutoShipments(orderId);
    } catch (err) {
      console.error("[order-confirmation] auto shipment enqueue failed", {
        orderId,
        error: String(err),
      });
    }
  }

  async clearCustomerCart(userId: string | null | undefined): Promise<void> {
    if (!userId) return;
    await this.cartService.clearCart(userId, null);
  }
}
