// webhook.service.ts
import type { Payment, WebhookEvent } from "@materialhub/database";
import { BadRequestError, HttpError, UnauthorizedError } from "@materialhub/plugins";
import jwt from "jsonwebtoken";
import type Stripe from "stripe";
import type { Repository } from "typeorm";
import type { OrderStatusService } from "../order/order-status.service.ts";
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
  /**
   * When true, a missing notificationToken REJECTS every Tamara webhook
   * (fail closed). Production sets this; dev/test stay permissive so a local
   * sandbox without a token can still exercise the flow.
   */
  requireNotificationToken?: boolean;
}

export interface StripeWebhookConfig {
  /** Stripe's webhook helper (`stripe.webhooks` or the static `Stripe.webhooks`). */
  webhooks: Pick<Stripe["webhooks"], "constructEventAsync">;
  /** Endpoint signing secret (`whsec_...`) from the Stripe dashboard. */
  secret: string;
}

export class StripeWebhookNotConfiguredError extends HttpError {
  constructor() {
    super(503, "Stripe webhook signing secret is not configured", "STRIPE_WEBHOOK_NOT_CONFIGURED");
  }
}

export class InvalidStripeSignatureError extends HttpError {
  constructor(message = "Invalid Stripe webhook signature") {
    super(400, message, "INVALID_SIGNATURE");
  }
}

export class WebhookService {
  constructor(
    private webhookRepo: Repository<WebhookEvent>,
    private paymentRepo: Repository<Payment>,
    private orderConfirmationService: OrderConfirmationService,
    private orderStatusService?: OrderStatusService,
    private tamaraConfig?: TamaraWebhookConfig,
    private stripeWebhookConfig?: StripeWebhookConfig,
  ) {}

  /**
   * Entry point for POST /webhooks/stripe. Verifies the `stripe-signature`
   * header against the RAW request body before anything is read from it or
   * written to webhook_events, then hands the VERIFIED event's id/type/object
   * to handleStripeWebhook (which owns idempotency). Fails closed: no secret
   * configured → 503; missing/invalid signature → 400.
   */
  async handleStripeWebhookRequest(
    rawBody: string,
    signature: string | null | undefined,
  ): Promise<{ skipped: boolean }> {
    const secret = this.stripeWebhookConfig?.secret;
    if (!secret || !this.stripeWebhookConfig?.webhooks) {
      console.error(
        "[webhook] STRIPE_WEBHOOK_SECRET is not set — rejecting POST /webhooks/stripe (fail closed)",
      );
      throw new StripeWebhookNotConfiguredError();
    }
    if (!signature) {
      throw new InvalidStripeSignatureError("Missing stripe-signature header");
    }

    let event: Stripe.Event;
    try {
      // constructEventAsync, not constructEvent: under Bun the stripe package
      // resolves to its worker build (SubtleCrypto), whose sync variant always
      // throws — every genuine event would be rejected as a bad signature.
      event = await this.stripeWebhookConfig.webhooks.constructEventAsync(
        rawBody,
        signature,
        secret,
      );
    } catch {
      throw new InvalidStripeSignatureError();
    }

    return this.handleStripeWebhook(event.id, event.type, (event.data as any)?.object);
  }

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
        await this.processPaymentSuccess(payload);
      }

      if (eventType === "payment_intent.payment_failed") {
        await this.processPaymentFailure(payload);
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

    // Validate before any DB write — webhook_events.event_type is NOT NULL, and
    // the idempotency key is built from these two fields.
    if (
      !payload ||
      typeof payload !== "object" ||
      typeof payload.event_type !== "string" ||
      payload.event_type.length === 0 ||
      typeof payload.order_id !== "string" ||
      payload.order_id.length === 0
    ) {
      throw new BadRequestError("Tamara webhook requires string event_type and order_id");
    }

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

  private async processPaymentSuccess(payload: any): Promise<void> {
    const orderId = payload.metadata?.order_id;
    if (!orderId) return;

    // Only a PaymentIntent we created for this order, for at least the amount
    // we asked, confirms it. (The event is signature-verified, but amounts and
    // the order link are checked against our own payment row, not trusted.)
    const payment = await this.paymentRepo.findOne({
      where: { gateway_payment_id: payload.id } as any,
    });
    const received = Number(payload.amount_received ?? payload.amount ?? 0);
    if (
      !payment ||
      (payment as any).order_id !== orderId ||
      received < Number((payment as any).amount ?? Number.POSITIVE_INFINITY)
    ) {
      console.error("[webhook] stripe payment does not match its order; not confirming", {
        orderId,
        paymentIntent: payload.id,
        received,
        expected: (payment as any)?.amount ?? null,
      });
      return;
    }

    // Update Stripe-specific payment row (lookup by gateway_payment_id is
    // provider-specific, so this stays here rather than in
    // OrderConfirmationService).
    await this.markPaymentCaptured(payload.id);

    // Delegate the provider-agnostic confirmation bundle (order status flip,
    // inventory commit, status history, cart clear, downstream publishes) to
    // the single sink. Tabby / Tamara / Checkout.com webhooks call the same
    // method when wired up.
    await this.orderConfirmationService.markOrderPaid(orderId);
  }

  private async processPaymentFailure(payload: any): Promise<void> {
    const orderId = payload.metadata?.order_id;
    if (!orderId) return;

    if (!this.orderStatusService) {
      console.warn("[webhook] payment_failed received but orderStatusService not wired");
      return;
    }

    await this.orderStatusService.cancelOrder(
      orderId,
      { userId: "system", role: "system" } as any,
      "Payment failed",
    );
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

  private verifyTamaraNotificationToken(
    queryToken: string | null | undefined,
    authorizationHeader: string | null | undefined,
  ) {
    const token = queryToken || authorizationHeader?.replace(/^Bearer\s+/i, "").trim() || undefined;
    if (!this.tamaraConfig?.notificationToken) {
      if (this.tamaraConfig?.requireNotificationToken) {
        console.error(
          "[webhook] TAMARA_NOTIFICATION_TOKEN is not set — rejecting POST /webhooks/tamara (fail closed)",
        );
        throw new HttpError(
          503,
          "Tamara notification token is not configured",
          "TAMARA_WEBHOOK_NOT_CONFIGURED",
        );
      }
      return;
    }
    try {
      jwt.verify(token ?? "", this.tamaraConfig.notificationToken, {
        algorithms: ["HS256"],
      });
    } catch {
      throw new UnauthorizedError("Invalid Tamara notification token");
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
