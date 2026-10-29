// booking-lifecycle.client.ts
import { config } from "@materialhub/config";
import { BadRequestError, ServiceUnavailableError } from "@materialhub/plugins";
import jwt from "jsonwebtoken";

export interface BookingLifecycleConfirmResult {
  id: string;
  status: string;
}

export interface BookingLifecyclePaymentFailedResult {
  id: string;
  status: string;
}

interface BookingLifecycleClientOptions {
  fetcher?: typeof fetch;
  baseUrl?: string;
}

/**
 * Thin internal HTTP client for booking-service's
 * `/internal/bookings/:id/{confirm,payment-failed}` routes (Phase 4 Task 3
 * — order-service owns Stripe/webhooks, booking-service owns the booking
 * lifecycle; a Stripe event tagged `metadata.booking_id` gets routed here
 * instead of the order flow).
 *
 * Signs a short-lived HS256 internal-service JWT (`iss: "order-service"`,
 * `INTERNAL_SERVICE_SECRET`) — the EXACT signing/verification mechanism
 * booking-service's `internalServiceAuth` guard checks
 * (backend/libs/guards/src/internal-service-auth.ts: `jwt.verify(token,
 * secret)` + issuer allowlist, which already lists `"order-service"`), and
 * the same pattern booking-service's own `BookingPaymentClient` uses to call
 * order-service the other direction
 * (apps/booking-service/src/domain/booking/booking-payment.client.ts) — this
 * is that template, mirrored with the issuer flipped and the base URL
 * pointed at booking-service instead of order-service. No new auth scheme.
 *
 * Base URL resolution mirrors BookingPaymentClient: `BOOKING_SERVICE_URL`
 * env override, else `config.serviceHost.booking:config.port.booking`
 * (localhost:3009 in dev, matching docker-compose.yml / libs/config).
 */
export class BookingLifecycleClient {
  private readonly fetcher: typeof fetch;
  private readonly baseUrl: string;

  constructor(opts: BookingLifecycleClientOptions = {}) {
    this.fetcher = opts.fetcher ?? fetch;
    this.baseUrl =
      opts.baseUrl ??
      process.env.BOOKING_SERVICE_URL ??
      `http://${config.serviceHost.booking}:${config.port.booking}`;
  }

  /**
   * setup_intent.succeeded (prepay) / payment_intent.succeeded (deposit) ->
   * pending_payment -> confirmed. Idempotent on the booking-service side
   * (BookingStatusService.confirm), so a duplicate Stripe delivery that
   * somehow reaches this twice (should already be deduped by order-service's
   * `webhook_events` table) is still safe.
   */
  async confirm(bookingId: string): Promise<BookingLifecycleConfirmResult> {
    return this.post<BookingLifecycleConfirmResult>(`/internal/bookings/${bookingId}/confirm`, {});
  }

  /**
   * payment_intent.payment_failed / payment_intent.canceled tagged with a
   * booking_id. Thin on the booking-service side for Phase 4 Task 3 (see
   * BookingStatusService.handlePaymentFailed) — the deeper notify + pay-now
   * link + follow-up-cancel flow is Task 7b.
   */
  async paymentFailed(
    bookingId: string,
    reason?: string | null,
  ): Promise<BookingLifecyclePaymentFailedResult> {
    return this.post<BookingLifecyclePaymentFailedResult>(
      `/internal/bookings/${bookingId}/payment-failed`,
      { reason: reason ?? null },
    );
  }

  private signToken(): string {
    const secret = process.env.INTERNAL_SERVICE_SECRET;
    if (!secret) {
      throw new ServiceUnavailableError("INTERNAL_SERVICE_SECRET not configured");
    }
    return jwt.sign({ iss: "order-service" }, secret, { expiresIn: "5m" });
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
        `booking-service unreachable calling ${path}: ${(err as Error).message}`,
      );
    }
    const json = (await res.json().catch(() => ({}))) as { data?: T; message?: string };
    if (!res.ok) {
      const message = json.message ?? `booking-service ${path} failed (${res.status})`;
      if (res.status >= 500) throw new ServiceUnavailableError(message);
      throw new BadRequestError(message);
    }
    return json.data as T;
  }
}
