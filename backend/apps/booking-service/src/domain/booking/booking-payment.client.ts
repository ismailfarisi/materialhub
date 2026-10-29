import { config } from "@materialhub/config";
import { BadRequestError, ServiceUnavailableError } from "@materialhub/plugins";
import jwt from "jsonwebtoken";

// A Stripe-Customer-compliance address shape (Stripe requires name+address for
// some account configurations to allow off-session/cross-border charges —
// see order-service's internal-booking-payment.integration.test.ts
// COMPLIANT_CUSTOMER_FIELDS). Optional everywhere it's used.
export interface BookingPaymentAddress {
  line1?: string;
  city?: string;
  country?: string;
}

export interface BookingPaymentSetupInput {
  bookingId: string;
  userId: string;
  email: string;
  stripeCustomerId?: string | null;
  name?: string | null;
  address?: BookingPaymentAddress | null;
}
export interface BookingPaymentSetupResult {
  paymentId: string;
  clientSecret: string;
  setupIntentId: string;
  stripeCustomerId: string;
}

export interface BookingPaymentAuthorizeInput {
  bookingId: string;
  userId: string;
  stripeCustomerId: string;
  paymentMethodId: string;
  amountFils: number;
  currency?: string;
}
export interface BookingPaymentAuthorizeResult {
  paymentId: string;
  paymentIntentId: string;
  status: string;
  failureReason: string | null;
}

export interface BookingPaymentIntentInput {
  bookingId: string;
  userId: string;
  amountFils: number;
  currency?: string;
  name?: string | null;
  address?: BookingPaymentAddress | null;
}
export interface BookingPaymentIntentResult {
  paymentId: string;
  clientSecret: string;
  paymentIntentId: string;
}

export interface BookingPaymentCaptureInput {
  bookingId: string;
  paymentIntentId: string;
  amountFils?: number;
}
export interface BookingPaymentCaptureResult {
  paymentIntentId: string;
  status: string;
}

export interface BookingPaymentVoidInput {
  bookingId: string;
  paymentIntentId: string;
  reason?: string | null;
}
export interface BookingPaymentVoidResult {
  paymentIntentId: string;
  status: string;
}

export interface BookingPaymentRefundInput {
  bookingId: string;
  amountFils: number;
  referenceType: "cancellation" | "no_show_reversal" | "admin_adjustment";
  referenceId: string;
  reason?: string | null;
}
export interface BookingPaymentRefundResult {
  gateway: string;
  gatewayRefundId: string;
  amountFils: number;
}

export interface BookingPaymentCompleteInput {
  bookingId: string;
  // null for deposit/pay_at_venue (nothing to capture — deposit was already
  // captured at booking time, pay_at_venue is paid in person); set for
  // prepay (the authorized manual-capture PaymentIntent id).
  paymentIntentId: string | null;
  vendorId: string;
  commissionRate: number;
  commissionFils: number;
  // The booking's snapshotted commission TYPE ("percentage" | "fixed" |
  // "tiered", from `booking.commission_type`) — review fix so order-service
  // stores the real type on the accrued commission row instead of hardcoding
  // "percentage" for every booking (which mislabeled fixed-rate vendors'
  // fils CAP as if it were a percent).
  commissionType: string;
  priceFils: number;
  vatFils: number;
}
export interface BookingPaymentCompleteResult {
  captured: boolean;
  paymentIntentId: string | null;
  paymentStatus: string | null;
  commissionId: string;
  commissionCreated: boolean;
}

interface BookingPaymentClientOptions {
  fetcher?: typeof fetch;
  baseUrl?: string;
}

/**
 * Thin internal HTTP client for order-service's `/internal/booking-payments/*`
 * routes (Phase 4 Task 2 — money stays in order-service, spec §3;
 * apps/order-service/src/routes/internal-booking-payment.routes.ts).
 *
 * Signs a short-lived HS256 internal-service JWT (`iss: "booking-service"`,
 * `INTERNAL_SERVICE_SECRET`) — the exact mechanism order-service's
 * `internalServiceAuth` guard verifies
 * (backend/libs/guards/src/internal-service-auth.ts: `jwt.verify(token,
 * secret)` + issuer allowlist check), and the SAME signing pattern already
 * used for a cross-service internal call in
 * apps/integration-service/src/domain/inbound/domain-dispatch.ts
 * (`jwt.sign({ iss }, secret, { expiresIn: "5m" })`, `Authorization: Bearer
 * <token>`) — reused verbatim here rather than inventing a new internal-auth
 * scheme. (Note: some other cross-service calls — e.g.
 * apps/reels-service/src/domain/reels/verified-purchase.guard.ts,
 * taggable-products.fetchers.ts — send an `x-internal-secret` header instead;
 * that is a DIFFERENT, older internal-auth scheme guarding DIFFERENT routes,
 * not what `internalServiceAuth`/this boundary checks, so it doesn't apply
 * here.)
 *
 * Base URL resolution mirrors verified-purchase.guard.ts /
 * taggable-products.fetchers.ts: `ORDER_SERVICE_URL` env override, else
 * `config.serviceHost.order:config.port.order` (localhost:3003 in dev,
 * matching docker-compose.yml).
 */
export class BookingPaymentClient {
  private readonly fetcher: typeof fetch;
  private readonly baseUrl: string;

  constructor(opts: BookingPaymentClientOptions = {}) {
    this.fetcher = opts.fetcher ?? fetch;
    this.baseUrl =
      opts.baseUrl ??
      process.env.ORDER_SERVICE_URL ??
      `http://${config.serviceHost.order}:${config.port.order}`;
  }

  async setup(input: BookingPaymentSetupInput): Promise<BookingPaymentSetupResult> {
    const data = await this.post<{
      payment_id: string;
      client_secret: string;
      setup_intent_id: string;
      stripe_customer_id: string;
    }>("/internal/booking-payments/setup", {
      booking_id: input.bookingId,
      user_id: input.userId,
      email: input.email,
      stripe_customer_id: input.stripeCustomerId ?? null,
      name: input.name ?? null,
      address: input.address ?? null,
    });
    return {
      paymentId: data.payment_id,
      clientSecret: data.client_secret,
      setupIntentId: data.setup_intent_id,
      stripeCustomerId: data.stripe_customer_id,
    };
  }

  async authorize(input: BookingPaymentAuthorizeInput): Promise<BookingPaymentAuthorizeResult> {
    const data = await this.post<{
      payment_id: string;
      payment_intent_id: string;
      status: string;
      failure_reason: string | null;
    }>("/internal/booking-payments/authorize", {
      booking_id: input.bookingId,
      user_id: input.userId,
      stripe_customer_id: input.stripeCustomerId,
      payment_method_id: input.paymentMethodId,
      amount_fils: input.amountFils,
      currency: input.currency,
    });
    return {
      paymentId: data.payment_id,
      paymentIntentId: data.payment_intent_id,
      status: data.status,
      failureReason: data.failure_reason ?? null,
    };
  }

  async intent(input: BookingPaymentIntentInput): Promise<BookingPaymentIntentResult> {
    const data = await this.post<{
      payment_id: string;
      client_secret: string;
      payment_intent_id: string;
    }>("/internal/booking-payments/intent", {
      booking_id: input.bookingId,
      user_id: input.userId,
      amount_fils: input.amountFils,
      currency: input.currency,
      name: input.name ?? null,
      address: input.address ?? null,
    });
    return {
      paymentId: data.payment_id,
      clientSecret: data.client_secret,
      paymentIntentId: data.payment_intent_id,
    };
  }

  async capture(input: BookingPaymentCaptureInput): Promise<BookingPaymentCaptureResult> {
    const data = await this.post<{ payment_intent_id: string; status: string }>(
      "/internal/booking-payments/capture",
      {
        booking_id: input.bookingId,
        payment_intent_id: input.paymentIntentId,
        amount_fils: input.amountFils,
      },
    );
    return { paymentIntentId: data.payment_intent_id, status: data.status };
  }

  async void(input: BookingPaymentVoidInput): Promise<BookingPaymentVoidResult> {
    const data = await this.post<{ payment_intent_id: string; status: string }>(
      "/internal/booking-payments/void",
      {
        booking_id: input.bookingId,
        payment_intent_id: input.paymentIntentId,
        reason: input.reason ?? null,
      },
    );
    return { paymentIntentId: data.payment_intent_id, status: data.status };
  }

  async refund(input: BookingPaymentRefundInput): Promise<BookingPaymentRefundResult> {
    const data = await this.post<{
      gateway: string;
      gateway_refund_id: string;
      amount_fils: number;
    }>("/internal/booking-payments/refund", {
      booking_id: input.bookingId,
      amount_fils: input.amountFils,
      reference_type: input.referenceType,
      reference_id: input.referenceId,
      reason: input.reason ?? null,
    });
    return {
      gateway: data.gateway,
      gatewayRefundId: data.gateway_refund_id,
      amountFils: data.amount_fils,
    };
  }

  /**
   * Booking completion (Phase 4 Task 9, spec §5.2 step 3 / §5.3 "On
   * completed"): captures the prepay authorization (when `paymentIntentId`
   * is set) and accrues commission from the booking's SNAPSHOTTED
   * rate/amount, in one order-service call so both effects land together.
   * Idempotent server-side — safe to call again on a retry (e.g. an
   * already-completed booking, per Task 9's idempotency requirement).
   */
  async complete(input: BookingPaymentCompleteInput): Promise<BookingPaymentCompleteResult> {
    const data = await this.post<{
      captured: boolean;
      payment_intent_id: string | null;
      payment_status: string | null;
      commission_id: string;
      commission_created: boolean;
    }>("/internal/booking-payments/complete", {
      booking_id: input.bookingId,
      payment_intent_id: input.paymentIntentId,
      vendor_id: input.vendorId,
      commission_rate: input.commissionRate,
      commission_fils: input.commissionFils,
      commission_type: input.commissionType,
      price_fils: input.priceFils,
      vat_fils: input.vatFils,
    });
    return {
      captured: data.captured,
      paymentIntentId: data.payment_intent_id,
      paymentStatus: data.payment_status,
      commissionId: data.commission_id,
      commissionCreated: data.commission_created,
    };
  }

  private signToken(): string {
    const secret = process.env.INTERNAL_SERVICE_SECRET;
    if (!secret) {
      throw new ServiceUnavailableError("INTERNAL_SERVICE_SECRET not configured");
    }
    return jwt.sign({ iss: "booking-service" }, secret, { expiresIn: "5m" });
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    let res: Response;
    try {
      res = await this.fetcher(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.signToken()}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new ServiceUnavailableError(
        `order-service unreachable calling ${path}: ${(err as Error).message}`,
      );
    }
    const json = (await res.json().catch(() => ({}))) as { data?: T; message?: string };
    if (!res.ok) {
      const message = json.message ?? `order-service ${path} failed (${res.status})`;
      if (res.status >= 500) throw new ServiceUnavailableError(message);
      throw new BadRequestError(message);
    }
    return json.data as T;
  }
}
