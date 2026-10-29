import type { Order, Payment } from "@materialhub/database";
import type Stripe from "stripe";
import { LessThan, type Repository } from "typeorm";
import type { OrderStatusService } from "./order-status.service.ts";

const PREPAID_GATEWAYS = new Set(["stripe", "tabby", "tamara", "checkout_com"]);

// Stripe PaymentIntent states that mean money is landing — never cancel these.
const STRIPE_LIVE_STATES = new Set(["succeeded", "processing", "requires_capture"]);

export interface ReapSummary {
  scanned: number;
  cancelled: number;
  skipped: number;
  errored: number;
}

/**
 * Cancels abandoned prepaid orders stuck in `pending_payment` past
 * `windowMinutes`, releasing their held inventory via
 * `OrderStatusService.cancelOrder`. COD orders (which also sit in
 * `pending_payment` until fulfillment progresses) are excluded — only orders
 * whose payment is a prepaid gateway with no captured payment are touched.
 */
export class PendingOrderReaperService {
  constructor(
    private orderRepo: Repository<Order>,
    private paymentRepo: Repository<Payment>,
    private orderStatusService: OrderStatusService,
    private stripe: Stripe | null,
    private windowMinutes: number,
  ) {}

  async reapExpired(): Promise<ReapSummary> {
    const cutoff = new Date(Date.now() - this.windowMinutes * 60_000);
    const candidates = await this.orderRepo.find({
      where: { status: "pending_payment", created_at: LessThan(cutoff) } as any,
      order: { created_at: "ASC" } as any,
      take: 100,
    });

    const summary: ReapSummary = {
      scanned: candidates.length,
      cancelled: 0,
      skipped: 0,
      errored: 0,
    };

    for (const order of candidates) {
      try {
        const cancelled = await this.reapOne(order);
        if (cancelled) summary.cancelled++;
        else summary.skipped++;
      } catch (err) {
        summary.errored++;
        console.error("[pending-order-reaper] failed to reap order", {
          orderId: (order as any).id,
          error: String(err),
        });
      }
    }

    return summary;
  }

  // Returns true if the order was cancelled, false if intentionally skipped.
  private async reapOne(order: Order): Promise<boolean> {
    const payments = await this.paymentRepo.find({
      where: { order_id: (order as any).id } as any,
    });

    // Already paid — a webhook should confirm it; never cancel.
    if (payments.some((p) => (p as any).status === "captured")) return false;

    // COD / non-prepaid orders legitimately sit in pending_payment — skip.
    //
    // But "no prepaid row" and "COD" are not the same thing: an order with NO
    // payment row at all is one where the customer abandoned checkout before
    // picking any method. This guard was written for COD and swallowed those
    // too, so they sat in pending_payment forever — holding reserved
    // inventory and showing the vendor a `confirmed` sub-order for an order
    // nobody ever paid for. Only skip when a non-prepaid (COD) row actually
    // exists; a payment-less order past the window is abandoned by definition.
    //
    // A COD row is decisive on its own, even alongside a prepaid row.
    // `/checkout/payment-intent` is an unguarded switch (checkout.service.ts)
    // that neither rejects a second call with a different method nor clears
    // the earlier payment row, so "tried card, abandoned, came back and chose
    // COD" leaves BOTH rows on one order. COD does not capture until delivery,
    // so the captured-payment guard above can't see it — without this the
    // reaper would follow the dead PaymentIntent and cancel a COD order that
    // `triggerAutoShipments` has already booked and dispatched.
    if (payments.some((p) => (p as any).gateway === "cod")) return false;

    const prepaid = payments.filter((p) => PREPAID_GATEWAYS.has((p as any).gateway));
    if (prepaid.length === 0 && payments.length > 0) return false;

    // Stripe: an order can hold multiple PaymentIntents (each checkout retry
    // inserts a new payments row). Never cancel the order if ANY of its PIs is
    // live — otherwise a customer who paid on a later attempt whose success
    // webhook is delayed gets charged with no order. Verify every Stripe row,
    // skip the whole order if any PI is live, and only then cancel each (dead) PI.
    const stripeRows = prepaid.filter((p) => (p as any).gateway === "stripe");
    if (stripeRows.length > 0) {
      // Without the SDK we can neither verify nor cancel PIs — leave it.
      if (!this.stripe) return false;

      const piIds: string[] = [];
      for (const row of stripeRows) {
        const piId = (row as any).gateway_payment_id as string | null;
        // No PaymentIntent to verify — don't cancel a Stripe order blindly.
        if (!piId) return false;
        const pi = await this.stripe.paymentIntents.retrieve(piId);
        if (STRIPE_LIVE_STATES.has(pi.status)) return false;
        piIds.push(piId);
      }

      for (const piId of piIds) {
        try {
          // Cancel the PI so the customer can't pay a dead order later.
          await this.stripe.paymentIntents.cancel(piId);
        } catch {
          // PI became live between retrieve and cancel → do not cancel the order.
          return false;
        }
      }
    }

    await this.orderStatusService.cancelOrder(
      (order as any).id,
      { userId: "system", role: "system" },
      `Payment not completed within ${this.windowMinutes} minutes`,
    );
    return true;
  }
}
