// webhook.service.ts
import type { Payment, WebhookEvent } from "@materialhub/database";
import jwt from "jsonwebtoken";
import type { Repository } from "typeorm";
import type { OrderStatusService } from "../order/order-status.service.ts";
import type { BookingLifecycleClient } from "./booking-lifecycle.client.ts";
import type { OrderConfirmationService } from "./order-confirmation.service.ts";

type FetchLike = typeof fetch;

/**
 * Tamara states that end a checkout without money moving. The order itself is
 * left alone — pending-order-reaper.service.ts owns cancellation and inventory
 * release, and duplicating that here would race it.
 */
const TAMARA_TERMINAL_EVENTS: Record<string, "failed" | "cancelled"> = {
  order_declined: "failed",
  order_expired: "failed",
  order_canceled: "cancelled",
};

export interface TamaraWebhookConfig {
  apiToken?: string;
  apiBaseUrl: string;
  notificationToken?: string;
  fetch?: FetchLike;
}

export class WebhookService {
  constructor(
    private webhookRepo: Repository<WebhookEvent>,
    private paymentRepo: Repository<Payment>,
    private orderConfirmationService: OrderConfirmationService,
    private orderStatusService?: OrderStatusService,
    private tamaraConfig?: TamaraWebhookConfig,
    // Phase 4 Task 3 — money stays here (order-service); a Stripe event
    // tagged `metadata.booking_id` (no `order_id`) routes to booking-service
    // over this client instead of the order-confirmation/order-status path.
    // Optional so existing call sites/tests that don't touch bookings keep
    // working unchanged.
    private bookingLifecycleClient?: BookingLifecycleClient,
  ) {}

  async handleStripeWebhook(
    eventId: string,
    eventType: string,
    payload: any,
  ): Promise<{ skipped: boolean }> {
    // Idempotency check
    const existing = await this.webhookRepo.findOne({
      where: { gateway: "stripe", event_id: eventId } as any,
    });
    if ((existing as any)?.status === "processed") return { skipped: true };

    // Log the webhook event
    const webhookEvent = await this.webhookRepo.save({
      gateway: "stripe",
      event_type: eventType,
      event_id: eventId,
      payload,
      status: "pending",
    } as any);

    try {
      if (eventType === "payment_intent.succeeded") {
        await this.processPaymentSuccess(payload, eventId);
      }

      // Prepay booking confirm (spec §5.2 step 1) — SetupIntent verifies +
      // saves the card, no money moves. Orders never use SetupIntents, so
      // this event type is booking-only; nothing to preserve for order_id.
      if (eventType === "setup_intent.succeeded") {
        await this.processSetupIntentSuccess(payload, eventId);
      }

      if (eventType === "payment_intent.payment_failed") {
        await this.processPaymentFailure(payload, eventId);
      }

      // Booking-only today (an un-captured booking PaymentIntent voided by
      // the reaper/off-session-auth-failure path, or expiring on its own).
      // Orders don't currently generate/handle this event type.
      if (eventType === "payment_intent.canceled") {
        await this.processPaymentCanceled(payload, eventId);
      }

      (webhookEvent as any).status = "processed";
      (webhookEvent as any).processed_at = new Date();
      await this.webhookRepo.save(webhookEvent);
      return { skipped: false };
    } catch (error: any) {
      (webhookEvent as any).status = "failed";
      (webhookEvent as any).error_message = error.message;
      (webhookEvent as any).attempts = ((webhookEvent as any).attempts || 0) + 1;
      (webhookEvent as any).last_attempt_at = new Date();
      await this.webhookRepo.save(webhookEvent);
      throw error;
    }
  }

  async handleTamaraWebhook(
    tamaraToken: string | null | undefined,
    authorizationHeader: string | null | undefined,
    payload: any,
  ): Promise<{ skipped: boolean }> {
    this.verifyTamaraNotificationToken(tamaraToken, authorizationHeader);

    const eventId = `${payload.event_type}:${payload.order_id}`;
    const existing = await this.webhookRepo.findOne({
      where: { gateway: "tamara", event_id: eventId } as any,
    });
    if ((existing as any)?.status === "processed") return { skipped: true };

    const webhookEvent = await this.webhookRepo.save({
      gateway: "tamara",
      event_type: payload.event_type,
      event_id: eventId,
      payload,
      status: "pending",
    } as any);

    try {
      if (payload.event_type === "order_approved") {
        await this.processTamaraApproved(payload);
      } else if (Object.hasOwn(TAMARA_TERMINAL_EVENTS, payload.event_type)) {
        // `in` also matches inherited Object.prototype keys (`constructor`,
        // `toString`, …) on an object literal — an event_type of
        // "constructor" would have resolved TAMARA_TERMINAL_EVENTS.constructor
        // (a FUNCTION) and assigned it into payment.status. Object.hasOwn
        // scopes the check to the object's own keys only.
        await this.processTamaraTerminal(payload);
      }

      (webhookEvent as any).status = "processed";
      (webhookEvent as any).processed_at = new Date();
      await this.webhookRepo.save(webhookEvent);
      return { skipped: false };
    } catch (error: any) {
      (webhookEvent as any).status = "failed";
      (webhookEvent as any).error_message = error.message;
      (webhookEvent as any).attempts = ((webhookEvent as any).attempts || 0) + 1;
      (webhookEvent as any).last_attempt_at = new Date();
      await this.webhookRepo.save(webhookEvent);
      throw error;
    }
  }

  private async processPaymentSuccess(payload: any, eventId: string): Promise<void> {
    const orderId = payload.metadata?.order_id;
    const bookingId = payload.metadata?.booking_id;
    if (!orderId && !bookingId) return;

    // Update Stripe-specific payment row (lookup by gateway_payment_id is
    // provider-specific, so this stays here rather than in
    // OrderConfirmationService). Shared by both order and booking payments —
    // the booking Payment row lives in order-service too (Task 2), keyed the
    // same way (gateway_payment_id = the PaymentIntent id).
    await this.markPaymentCaptured(payload.id);

    if (orderId) {
      // Delegate the provider-agnostic confirmation bundle (order status
      // flip, inventory commit, status history, cart clear, reels publish)
      // to the single sink. Tabby / Tamara / Checkout.com webhooks will call
      // the same method when wired up.
      await this.orderConfirmationService.markOrderPaid(orderId);
      return;
    }

    // Deposit-mode booking: the capture-now PaymentIntent succeeded ->
    // confirm the booking (spec §5.2 deposit mode). ALSO the landing spot
    // for a PREPAY booking's authorization capture at completion (Task 9) —
    // by the time that PI succeeds the booking is already `completed`, so
    // this is expected to be a safe no-op on booking-service's side (see
    // confirmBooking's 4xx handling below and BookingStatusService.confirm's
    // idempotent-on-any-non-pending_payment-status guard).
    await this.confirmBooking(bookingId, eventId);
  }

  private async processSetupIntentSuccess(payload: any, eventId: string): Promise<void> {
    const bookingId = payload.metadata?.booking_id;
    if (!bookingId) return;

    // Prepay mode: the SetupIntent verified + saved the card — no money
    // moved. `authorized` is the closest fit in PaymentStatus for "verified,
    // ready for a future off-session charge"; the real off-session charge
    // (Task 7b's booking-auth job) writes its OWN Payment row via
    // createBookingOffSessionAuthorization, so this doesn't collide with it.
    const payment = await this.paymentRepo.findOne({
      where: { gateway_payment_id: payload.id } as any,
    });
    if (payment) {
      (payment as any).status = "authorized";
      (payment as any).authorized_at = new Date();
      // Stash the attached PaymentMethod id (the real, observable end state
      // of the frontend's 3DS challenge — see booking-payment
      // .client.ts/internal-booking-payment.integration.test.ts's header
      // comment) alongside the stripe_customer_id already recorded at
      // /setup time (payment.service.ts's createBookingSetupIntent). Task
      // 7b's booking-auth job reads BOTH back off this same Payment row
      // (booking.payment_id -> this row, direct DB read — booking-service
      // and order-service already share one Postgres instance, the same
      // pattern booking-reaper.service.ts uses to resolve a deposit's
      // gateway_payment_id) to call createBookingOffSessionAuthorization
      // off-session, without booking-service ever touching Stripe directly.
      if (payload.payment_method) {
        (payment as any).gateway_response = {
          ...((payment as any).gateway_response ?? {}),
          payment_method_id: payload.payment_method,
        };
      }
      await this.paymentRepo.save(payment);
    }

    await this.confirmBooking(bookingId, eventId);
  }

  private async processPaymentFailure(payload: any, eventId: string): Promise<void> {
    const orderId = payload.metadata?.order_id;
    const bookingId = payload.metadata?.booking_id;
    if (!orderId && !bookingId) return;

    if (orderId) {
      if (!this.orderStatusService) {
        console.warn("[webhook] payment_failed received but orderStatusService not wired");
        return;
      }

      await this.orderStatusService.cancelOrder(
        orderId,
        { userId: "system", role: "system" } as any,
        "Payment failed",
      );
      return;
    }

    const reason = payload.last_payment_error?.message ?? "Payment failed";
    await this.markPaymentFailed(payload.id, reason);
    await this.notifyBookingPaymentFailed(bookingId, reason, eventId);
  }

  private async processPaymentCanceled(payload: any, eventId: string): Promise<void> {
    // Orders don't handle payment_intent.canceled today, so there's no
    // order_id branch to preserve here — booking-only.
    const bookingId = payload.metadata?.booking_id;
    if (!bookingId) return;

    const payment = await this.paymentRepo.findOne({
      where: { gateway_payment_id: payload.id } as any,
    });
    if (payment) {
      (payment as any).status = "cancelled";
      await this.paymentRepo.save(payment);
    }

    await this.notifyBookingPaymentFailed(bookingId, "Payment canceled", eventId);
  }

  private async markPaymentCaptured(gatewayPaymentId: string): Promise<void> {
    const payment = await this.paymentRepo.findOne({
      where: { gateway_payment_id: gatewayPaymentId } as any,
    });
    if (payment) {
      (payment as any).status = "captured";
      (payment as any).captured_at = new Date();
      await this.paymentRepo.save(payment);
    }
  }

  private async markPaymentFailed(gatewayPaymentId: string, reason: string): Promise<void> {
    const payment = await this.paymentRepo.findOne({
      where: { gateway_payment_id: gatewayPaymentId } as any,
    });
    if (payment) {
      (payment as any).status = "failed";
      (payment as any).failed_at = new Date();
      (payment as any).failure_reason = reason;
      await this.paymentRepo.save(payment);
    }
  }

  private async confirmBooking(bookingId: string, eventId: string): Promise<void> {
    if (!this.bookingLifecycleClient) {
      console.warn("[webhook] booking payment succeeded but bookingLifecycleClient not wired");
      return;
    }
    try {
      await this.bookingLifecycleClient.confirm(bookingId);
    } catch (err) {
      this.handleBookingLifecycleError(err, bookingId, eventId, "confirm");
    }
  }

  private async notifyBookingPaymentFailed(
    bookingId: string,
    reason: string,
    eventId: string,
  ): Promise<void> {
    if (!this.bookingLifecycleClient) {
      console.warn("[webhook] booking payment failed but bookingLifecycleClient not wired");
      return;
    }
    try {
      await this.bookingLifecycleClient.paymentFailed(bookingId, reason);
    } catch (err) {
      this.handleBookingLifecycleError(err, bookingId, eventId, "paymentFailed");
    }
  }

  // Defense-in-depth for BookingStatusService.confirm()'s idempotency fix
  // (booking-service side): a booking-lifecycle call can still fail for
  // reasons THAT fix doesn't cover (e.g. an unknown booking_id -> 404, or
  // some other genuinely-illegal-on-arrival state -> 422/400). Stripe
  // redelivering the SAME event can never turn a 4xx into a 2xx — the
  // request itself is what's wrong, not a transient failure — so a 4xx from
  // BookingLifecycleClient is swallowed here as a non-retryable "processed"
  // outcome (logged, not rethrown) instead of bubbling up through
  // handleStripeWebhook's catch, which would mark the webhook_events row
  // `failed` and return a non-2xx to Stripe, triggering an infinite retry
  // storm for an event that will NEVER succeed.
  //
  // A 5xx (booking-service down, DB unavailable, etc — genuinely transient)
  // or an unreachable-service error (BookingLifecycleClient.post wraps
  // network failures in ServiceUnavailableError, statusCode 503) is still
  // rethrown so handleStripeWebhook marks the event `failed` and Stripe
  // retries it later, once booking-service is back.
  //
  // BookingLifecycleClient.post maps every non-2xx, non-5xx response to
  // BadRequestError (statusCode 400) regardless of booking-service's actual
  // status code (400/404/422 all collapse to 400 client-side) — so "4xx" here
  // is simply `statusCode` in the [400, 500) range.
  private handleBookingLifecycleError(
    err: unknown,
    bookingId: string,
    eventId: string,
    op: "confirm" | "paymentFailed",
  ): void {
    const statusCode = (err as { statusCode?: unknown })?.statusCode;
    if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 500) {
      console.warn(
        `[webhook] booking-lifecycle ${op} for booking ${bookingId} (event ${eventId}) returned ` +
          `non-retryable ${statusCode} — treating as processed, NOT retrying: ${(err as Error)?.message}`,
      );
      return;
    }
    // 5xx / unreachable / anything without a recognizable statusCode:
    // retryable — propagate so the ORDER-path catch in handleStripeWebhook
    // marks this event `failed` and Stripe redelivers it.
    throw err;
  }

  private verifyTamaraNotificationToken(
    queryToken: string | null | undefined,
    authorizationHeader: string | null | undefined,
  ) {
    const token = queryToken || authorizationHeader?.replace(/^Bearer\s+/i, "").trim() || undefined;
    if (!this.tamaraConfig?.notificationToken) return;
    try {
      jwt.verify(token ?? "", this.tamaraConfig.notificationToken, {
        algorithms: ["HS256"],
      });
    } catch {
      throw new Error("Invalid Tamara notification token");
    }
  }

  private async processTamaraApproved(payload: any): Promise<void> {
    if (!this.tamaraConfig?.apiToken) {
      throw new Error("Tamara API token is not configured");
    }
    const tamaraOrderId = payload.order_id;
    const merchantOrderId = payload.order_reference_id;
    if (!tamaraOrderId || !merchantOrderId) return;

    const tamaraFetch = this.tamaraConfig.fetch ?? fetch;
    const response = await tamaraFetch(
      `${trimTrailingSlash(this.tamaraConfig.apiBaseUrl)}/orders/${tamaraOrderId}/authorise`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.tamaraConfig.apiToken}`,
          Accept: "application/json",
        },
      },
    );
    const responseBody = await readJson(response);
    if (!response.ok) {
      throw new Error(
        `Tamara authorise failed: ${response.status} ${JSON.stringify(responseBody)}`,
      );
    }

    const payment = await this.paymentRepo.findOne({
      where: { gateway: "tamara", gateway_order_id: tamaraOrderId } as any,
    });
    if (payment) {
      (payment as any).status = "authorized";
      (payment as any).gateway_order_id = tamaraOrderId;
      (payment as any).gateway_response = {
        ...((payment as any).gateway_response ?? {}),
        authorise: responseBody,
      };
      (payment as any).authorized_at = new Date();
      await this.paymentRepo.save(payment);
    }

    await this.orderConfirmationService.markOrderPaid(merchantOrderId);
  }

  private async processTamaraTerminal(payload: any): Promise<void> {
    const tamaraOrderId = payload.order_id;
    if (!tamaraOrderId) return;

    const payment = await this.paymentRepo.findOne({
      where: { gateway: "tamara", gateway_order_id: tamaraOrderId } as any,
    });
    // A terminal event for a session we never persisted is not an error —
    // there is nothing to settle.
    if (!payment) return;

    // I2 final-review fix: settle only a still-`pending` payment. Nothing in
    // order-service ever moves a Tamara row to "captured" —
    // processTamaraApproved leaves it "authorized" — so an unconditional
    // assignment here would let a terminal event that arrives AFTER approval
    // (e.g. a stale/duplicate order_expired) flip an already-authorized (or
    // captured) row to failed/cancelled while the order itself stays
    // payment_status=captured and ships. The event is still recorded in
    // webhook_events with its full payload either way, so nothing is lost —
    // this only skips the Payment row mutation.
    if ((payment as any).status !== "pending") {
      console.warn(
        `[tamara] ignoring terminal event "${payload.event_type}" for payment ${(payment as any).id} ` +
          `(gateway_order_id=${tamaraOrderId}) already in status "${(payment as any).status}"`,
      );
      return;
    }

    const nextStatus =
      TAMARA_TERMINAL_EVENTS[payload.event_type as keyof typeof TAMARA_TERMINAL_EVENTS];
    (payment as any).status = nextStatus;
    (payment as any).failure_reason = payload.event_type;
    // I3 final-review fix: markPaymentFailed (above) and payment.service.ts's
    // wrapStripeError decline path both stamp failed_at on a failed payment —
    // this handler set status+failure_reason but not failed_at, so ops
    // queries keyed on failed_at would never see a Tamara decline.
    if (nextStatus === "failed") {
      (payment as any).failed_at = new Date();
    }
    (payment as any).gateway_response = {
      ...((payment as any).gateway_response ?? {}),
      terminal: payload,
    };
    await this.paymentRepo.save(payment);
  }
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

async function readJson(response: Response): Promise<Record<string, any>> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
