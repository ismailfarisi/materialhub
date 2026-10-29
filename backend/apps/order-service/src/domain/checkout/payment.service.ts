import { OrderStatus, Payment, PaymentStatus } from "@materialhub/database";
import type { Order } from "@materialhub/database";
import { HttpError, NotFoundError, ServiceUnavailableError } from "@materialhub/plugins";
import type Stripe from "stripe";
// payment.service.ts
import type { EntityManager, Repository } from "typeorm";

type FetchLike = typeof fetch;
const STRIPE_DEFAULT_POSTAL_CODE = "00000";

export interface TamaraPaymentConfig {
  apiToken?: string;
  apiBaseUrl: string;
  successUrl: string;
  failureUrl: string;
  cancelUrl: string;
  notificationUrl: string;
  /** Origins a caller may supply redirect URLs for. Empty/undefined = config only. */
  allowedRedirectOrigins?: string[];
  /** Non-production-only extra-origin patterns (Vercel preview deploys). */
  allowedRedirectOriginPatterns?: RegExp[];
  fetch?: FetchLike;
}

export interface TamaraRedirectUrls {
  returnUrl?: string;
  failureUrl?: string;
  cancelUrl?: string;
}

export class PaymentService {
  constructor(
    private paymentRepo: Repository<Payment>,
    private stripe: Stripe,
    private orderRepo?: Repository<Order>,
    private tamaraConfig?: TamaraPaymentConfig,
  ) {
    // C1 final-review fix: the only signal an operator previously had for a
    // misconfigured (empty) redirect allowlist was a per-URL console.warn
    // naming the *rejected* origin — which reads as "a client sent a bad
    // URL", not "the allowlist itself is empty". Log the resolved allowlist
    // once, here, so a boot log makes a misconfiguration self-evident.
    if (this.tamaraConfig) {
      const origins = this.tamaraConfig.allowedRedirectOrigins ?? [];
      const patterns = this.tamaraConfig.allowedRedirectOriginPatterns ?? [];
      console.info(
        `[tamara] merchant redirect allowlist resolved: origins=[${origins.join(", ")}]${
          patterns.length ? ` patterns=[${patterns.map(String).join(", ")}]` : ""
        }${
          origins.length === 0 && patterns.length === 0
            ? " — EMPTY: every client-supplied redirect URL will be discarded"
            : ""
        }`,
      );
    }
  }

  async createStripePaymentIntent(data: {
    orderId: string;
    userId: string;
    amount: number;
    currency?: string;
  }): Promise<{ clientSecret: string; paymentIntentId: string }> {
    // Fetch order for shipping address (required by Stripe for Indian export regulations)
    const order = this.orderRepo
      ? await this.orderRepo.findOne({ where: { id: data.orderId } })
      : null;
    const addr = (order as any)?.shipping_address || {};

    const pi = await this.stripe.paymentIntents.create({
      amount: data.amount,
      currency: data.currency || "aed",
      description: `MaterialHub order ${(order as any)?.order_number || data.orderId}`,
      metadata: { order_id: data.orderId, user_id: data.userId },
      automatic_payment_methods: { enabled: true },
      shipping: {
        name:
          addr.full_name || `${addr.first_name || ""} ${addr.last_name || ""}`.trim() || "Customer",
        phone: addr.phone || undefined,
        address: {
          line1: addr.address_line_1 || addr.street || "",
          line2: addr.address_line_2 || addr.area || undefined,
          city: addr.city || "",
          state: addr.state || addr.emirate || "",
          postal_code: addr.postal_code || STRIPE_DEFAULT_POSTAL_CODE,
          country: addr.country_code || "AE",
        },
      },
    });

    await this.paymentRepo.save({
      order_id: data.orderId,
      user_id: data.userId,
      status: "pending",
      payment_method: "stripe",
      amount: data.amount,
      currency: data.currency || "AED",
      gateway: "stripe",
      gateway_payment_id: pi.id,
    } as any);

    return { clientSecret: pi.client_secret!, paymentIntentId: pi.id };
  }

  async createCodPayment(data: {
    orderId: string;
    userId: string;
    amount: number;
  }): Promise<{ status: string }> {
    await this.paymentRepo.save({
      order_id: data.orderId,
      user_id: data.userId,
      status: "pending",
      payment_method: "cash_on_delivery",
      amount: data.amount,
      currency: "AED",
      gateway: "cod",
    } as any);

    return { status: "pending" };
  }

  async createTabbySession(data: {
    orderId: string;
    userId: string;
    amount: number;
    returnUrl?: string;
  }): Promise<{ checkoutUrl: string; sessionId: string }> {
    // Tabby BNPL: create a checkout session via Tabby API
    // In production, this calls Tabby's /api/v2/checkout endpoint
    // For now, store the payment record and return a placeholder URL
    await this.paymentRepo.save({
      order_id: data.orderId,
      user_id: data.userId,
      status: "pending",
      payment_method: "tabby",
      amount: data.amount,
      currency: "AED",
      gateway: "tabby",
    } as any);

    // TODO: Replace with actual Tabby API call when API key is configured
    return {
      checkoutUrl: `https://checkout.tabby.ai/placeholder?order=${data.orderId}`,
      sessionId: `tabby_${data.orderId}`,
    };
  }

  async createTamaraSession(data: {
    orderId: string;
    userId: string;
    amount?: number;
    redirectUrls?: TamaraRedirectUrls;
  }): Promise<{ checkoutUrl: string; orderId: string; checkoutId: string; status: string }> {
    if (!this.tamaraConfig?.apiToken) {
      throw new Error("Tamara API token is not configured");
    }
    if (!this.orderRepo) {
      throw new Error("Order repository is required for Tamara checkout");
    }

    const order = await this.orderRepo.findOne({
      where: { id: data.orderId } as any,
      relations: { items: true, user: true } as any,
    });
    if (!order) {
      throw new Error("Order not found");
    }

    // C2 final-review fix: creating a Tamara session used to check only that
    // the order EXISTS, not that it is still payable. That let "Try Tamara
    // again" mint a fresh session on an order the pending-order-reaper had
    // already cancelled (inventory released, no reservation held) — the
    // customer could then pay for a dead order: order_approved ->
    // markOrderPaid proceeds (its idempotency guard is on
    // payment_status === "captured", still "pending" here) -> charged,
    // "order placed" email sent, commissions/affiliate conversions
    // published, carrier booking enqueued, with nothing ever reserved.
    // "Payable" mirrors the reaper's own target state: still awaiting
    // payment and not already paid.
    const orderStatus = (order as any).status;
    const orderPaymentStatus = (order as any).payment_status;
    const isPayable =
      orderStatus === OrderStatus.pending_payment && orderPaymentStatus !== PaymentStatus.captured;
    if (!isPayable) {
      throw new HttpError(
        409,
        `Order ${data.orderId} is not payable (status=${orderStatus}, payment_status=${orderPaymentStatus})`,
        "ORDER_NOT_PAYABLE",
      );
    }

    const payload = this.buildTamaraCheckoutPayload(order, data.redirectUrls);
    const tamaraFetch = this.tamaraConfig.fetch ?? fetch;
    const response = await tamaraFetch(
      `${trimTrailingSlash(this.tamaraConfig.apiBaseUrl)}/checkout`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.tamaraConfig.apiToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      },
    );
    const responseBody = await readJson(response);
    if (!response.ok) {
      throw new Error(
        `Tamara checkout session failed: ${response.status} ${JSON.stringify(responseBody)}`,
      );
    }

    const tamaraOrderId = String(responseBody.order_id ?? "");
    const checkoutId = String(responseBody.checkout_id ?? "");
    const checkoutUrl = String(responseBody.checkout_url ?? "");
    const status = String(responseBody.status ?? "new");
    if (!tamaraOrderId || !checkoutId || !checkoutUrl) {
      throw new Error("Tamara checkout response missing required identifiers");
    }

    // The order's own grand_total is authoritative; data.amount is a legacy
    // parameter no live caller still supplies. grand_total is a NOT NULL
    // integer column on a persisted order (order.entity.ts:59-60), so it can
    // never be missing here — nothing to guard.
    const resolvedAmount = (order as any).grand_total;

    await this.paymentRepo.save({
      order_id: data.orderId,
      user_id: data.userId,
      status: "pending",
      payment_method: "tamara",
      amount: resolvedAmount,
      currency: (order as any).currency ?? "AED",
      gateway: "tamara",
      gateway_payment_id: checkoutId,
      gateway_order_id: tamaraOrderId,
      gateway_response: responseBody,
      three_ds_redirect_url: checkoutUrl,
    } as any);

    return {
      checkoutUrl,
      orderId: tamaraOrderId,
      checkoutId,
      status,
    };
  }

  // ── Booking payments (Phase 4 Task 2, spec §5.2) ──────────────────────
  // Called only from order-service's internal /internal/booking-payments/*
  // routes (booking-service is the caller, over internalServiceAuth). Payment
  // rows here always carry booking_id with order_id null — enforced by the
  // DB's chk_payments_order_or_booking constraint.

  /**
   * prepay step 1 — verify + save a card off-session, no money held. Mints a
   * Stripe Customer when the caller doesn't already have one for this user
   * (booking-service persists `stripe_customer_id` on the booking row for
   * reuse across future bookings).
   */
  async createBookingSetupIntent(data: {
    bookingId: string;
    userId: string;
    email: string;
    stripeCustomerId?: string | null;
    name?: string | null;
    address?: { line1?: string; city?: string; country?: string } | null;
  }): Promise<{
    paymentId: string;
    clientSecret: string;
    setupIntentId: string;
    customerId: string;
  }> {
    if (!this.stripe) throw new ServiceUnavailableError("Stripe is not configured");

    let customerId: string;
    let setupIntent: Stripe.SetupIntent;
    try {
      customerId =
        data.stripeCustomerId ??
        (
          await this.stripe.customers.create(
            {
              email: data.email,
              name: data.name ?? undefined,
              address: data.address ?? undefined,
              metadata: { user_id: data.userId },
            },
            { idempotencyKey: `booking-setup-customer:${data.bookingId}` },
          )
        ).id;

      setupIntent = await this.stripe.setupIntents.create(
        {
          customer: customerId,
          usage: "off_session",
          // Card-only: off-session reuse for the booking-auth job needs a
          // payment_method it can confirm without customer interaction later.
          // Redirect-based methods (iDEAL, etc.) can't do that and would force
          // this call to also carry a return_url.
          payment_method_types: ["card"],
          metadata: { booking_id: data.bookingId, user_id: data.userId },
        },
        { idempotencyKey: `booking-setup:${data.bookingId}` },
      );
    } catch (err) {
      throw this.wrapStripeError(err);
    }

    const payment = await this.saveBookingPayment(data.bookingId, setupIntent.id, {
      order_id: null,
      user_id: data.userId,
      status: "pending",
      payment_method: "stripe",
      amount: 0,
      currency: "AED",
      gateway: "stripe",
      gateway_response: { kind: "setup_intent", stripe_customer_id: customerId },
    });

    return {
      paymentId: (payment as any).id,
      clientSecret: setupIntent.client_secret!,
      setupIntentId: setupIntent.id,
      customerId,
    };
  }

  /**
   * prepay step 2 — off-session manual-capture PaymentIntent on the saved
   * card, fired by the booking-auth job at T-(cancellation_window + 24h). A
   * decline / SCA challenge is a normal business outcome (not a system
   * failure): it's recorded as a failed Payment row and returned with
   * `status` reflecting Stripe's PI status so the caller can notify + retry,
   * rather than thrown as an error.
   */
  async createBookingOffSessionAuthorization(data: {
    bookingId: string;
    userId: string;
    stripeCustomerId: string;
    paymentMethodId: string;
    amountFils: number;
    currency?: string;
  }): Promise<{
    paymentId: string;
    paymentIntentId: string | null;
    status: string;
    failureReason?: string;
  }> {
    if (!this.stripe) throw new ServiceUnavailableError("Stripe is not configured");
    const currency = data.currency ?? "aed";
    const idempotencyKey = `booking-authorize:${data.bookingId}`;

    let pi: Stripe.PaymentIntent;
    try {
      pi = await this.stripe.paymentIntents.create(
        {
          amount: data.amountFils,
          currency,
          customer: data.stripeCustomerId,
          payment_method: data.paymentMethodId,
          capture_method: "manual",
          confirm: true,
          off_session: true,
          description: `MaterialHub booking ${data.bookingId} authorization`,
          metadata: { booking_id: data.bookingId, user_id: data.userId },
        },
        { idempotencyKey },
      );
    } catch (err) {
      const stripeErr = err as Stripe.errors.StripeError & {
        payment_intent?: Stripe.PaymentIntent;
      };
      const failedPi = stripeErr.payment_intent ?? null;
      const payment = await this.saveBookingPayment(data.bookingId, failedPi?.id ?? null, {
        order_id: null,
        user_id: data.userId,
        status: "failed",
        payment_method: "stripe",
        amount: data.amountFils,
        currency: currency.toUpperCase(),
        gateway: "stripe",
        failed_at: new Date(),
        failure_reason: stripeErr.message,
      });
      return {
        paymentId: (payment as any).id,
        paymentIntentId: failedPi?.id ?? null,
        status: failedPi?.status ?? "failed",
        failureReason: stripeErr.message,
      };
    }

    const requiresCapture = pi.status === "requires_capture";
    const payment = await this.saveBookingPayment(data.bookingId, pi.id, {
      order_id: null,
      user_id: data.userId,
      status: requiresCapture ? "authorized" : "failed",
      payment_method: "stripe",
      amount: data.amountFils,
      currency: currency.toUpperCase(),
      gateway: "stripe",
      authorized_at: requiresCapture ? new Date() : null,
    });

    return { paymentId: (payment as any).id, paymentIntentId: pi.id, status: pi.status };
  }

  /**
   * deposit mode — capture-now PaymentIntent (default automatic capture
   * method, unlike prepay's manual-capture authorization). On-session:
   * returns a client_secret for the frontend to confirm.
   */
  async createBookingDepositIntent(data: {
    bookingId: string;
    userId: string;
    amountFils: number;
    currency?: string;
    customerName?: string | null;
    customerAddress?: { line1?: string; city?: string; country?: string } | null;
  }): Promise<{ paymentId: string; clientSecret: string; paymentIntentId: string }> {
    if (!this.stripe) throw new ServiceUnavailableError("Stripe is not configured");
    const currency = data.currency ?? "aed";

    let pi: Stripe.PaymentIntent;
    try {
      pi = await this.stripe.paymentIntents.create(
        {
          amount: data.amountFils,
          currency,
          description: `MaterialHub booking ${data.bookingId} deposit`,
          metadata: { booking_id: data.bookingId, user_id: data.userId },
          automatic_payment_methods: { enabled: true },
          // Same "shipping" requirement createStripePaymentIntent already
          // documents (required by Stripe for Indian export regulations) —
          // service bookings have no shipment, but Stripe reuses this field to
          // carry the customer's name/address regardless.
          ...(data.customerName || data.customerAddress
            ? {
                shipping: {
                  name: data.customerName || "Customer",
                  address: {
                    line1: data.customerAddress?.line1 || "",
                    city: data.customerAddress?.city || "",
                    postal_code: STRIPE_DEFAULT_POSTAL_CODE,
                    country: data.customerAddress?.country || "AE",
                  },
                },
              }
            : {}),
        },
        { idempotencyKey: `booking-intent:${data.bookingId}` },
      );
    } catch (err) {
      throw this.wrapStripeError(err);
    }

    const payment = await this.saveBookingPayment(data.bookingId, pi.id, {
      order_id: null,
      user_id: data.userId,
      status: "pending",
      payment_method: "stripe",
      amount: data.amountFils,
      currency: currency.toUpperCase(),
      gateway: "stripe",
    });

    return {
      paymentId: (payment as any).id,
      clientSecret: pi.client_secret!,
      paymentIntentId: pi.id,
    };
  }

  /** Capture a manual-capture PI (prepay authorization on `completed`). */
  async captureBookingPayment(data: {
    bookingId: string;
    paymentIntentId: string;
    amountFils?: number;
  }): Promise<{ paymentIntentId: string; status: string }> {
    if (!this.stripe) throw new ServiceUnavailableError("Stripe is not configured");
    const payment = await this.paymentRepo.findOne({
      where: { booking_id: data.bookingId, gateway_payment_id: data.paymentIntentId } as any,
    });
    if (!payment) {
      throw new NotFoundError(
        `No payment found for booking ${data.bookingId} / PaymentIntent ${data.paymentIntentId}`,
      );
    }

    let pi: Stripe.PaymentIntent;
    try {
      pi = await this.stripe.paymentIntents.capture(
        data.paymentIntentId,
        data.amountFils ? { amount_to_capture: data.amountFils } : undefined,
        { idempotencyKey: `booking-capture:${data.paymentIntentId}` },
      );
    } catch (err) {
      throw this.wrapStripeError(err);
    }

    (payment as any).status = "captured";
    (payment as any).captured_at = new Date();
    await this.paymentRepo.save(payment);

    return { paymentIntentId: pi.id, status: pi.status };
  }

  /** Cancel/void an un-captured PI (reaper, or cancel-before-auth). */
  async voidBookingPayment(data: {
    bookingId: string;
    paymentIntentId: string;
    reason?: string | null;
  }): Promise<{ paymentIntentId: string; status: string }> {
    if (!this.stripe) throw new ServiceUnavailableError("Stripe is not configured");
    const payment = await this.paymentRepo.findOne({
      where: { booking_id: data.bookingId, gateway_payment_id: data.paymentIntentId } as any,
    });
    if (!payment) {
      throw new NotFoundError(
        `No payment found for booking ${data.bookingId} / PaymentIntent ${data.paymentIntentId}`,
      );
    }

    let pi: Stripe.PaymentIntent;
    try {
      pi = await this.stripe.paymentIntents.cancel(data.paymentIntentId, {
        idempotencyKey: `booking-void:${data.paymentIntentId}`,
      });
    } catch (err) {
      throw this.wrapStripeError(err);
    }

    (payment as any).status = "cancelled";
    if (data.reason) (payment as any).failure_reason = data.reason;
    await this.paymentRepo.save(payment);

    return { paymentIntentId: pi.id, status: pi.status };
  }

  /**
   * Booking completion — capture step, Stripe call only (Phase 4 Task 9,
   * spec §5.2 step 3 / §5.3 "On completed — capture"). Deliberately does NOT
   * write to the DB itself — kept OUTSIDE any DB transaction, mirroring
   * PayoutService.executeApprovedTransfer's own comment ("never hold a DB
   * transaction open across a network call"). The route handler persists the result via
   * `markBookingPaymentCapturedInTx` inside the SAME transaction as the
   * commission insert, so those two DB writes commit atomically even though
   * the Stripe call itself does not.
   *
   * Idempotent: a PaymentIntent already `captured` — either by an earlier
   * call to this same completion flow, or a retried completion (Task 9's
   * idempotency requirement: completing an already-completed booking must
   * not double-capture) — is treated as success without re-attempting
   * Stripe's capture call (Stripe rejects capturing an
   * already-succeeded PI). A concurrent-retry race where Stripe itself
   * reports the PI already `succeeded` (caught as a StripeError carrying the
   * PI) is treated the same way, defensively.
   */
  async captureBookingPaymentStripeOnly(data: {
    bookingId: string;
    paymentIntentId: string;
  }): Promise<{ paymentIntentId: string; status: string; alreadyCaptured: boolean }> {
    const payment = await this.paymentRepo.findOne({
      where: { booking_id: data.bookingId, gateway_payment_id: data.paymentIntentId } as any,
    });
    if (!payment) {
      throw new NotFoundError(
        `No payment found for booking ${data.bookingId} / PaymentIntent ${data.paymentIntentId}`,
      );
    }
    if ((payment as any).status === "captured") {
      return { paymentIntentId: data.paymentIntentId, status: "succeeded", alreadyCaptured: true };
    }
    if (!this.stripe) throw new ServiceUnavailableError("Stripe is not configured");

    let pi: Stripe.PaymentIntent;
    try {
      pi = await this.stripe.paymentIntents.capture(data.paymentIntentId, undefined, {
        idempotencyKey: `booking-capture:${data.paymentIntentId}`,
      });
    } catch (err) {
      const stripeErr = err as Stripe.errors.StripeError & {
        payment_intent?: Stripe.PaymentIntent;
      };
      if (stripeErr.payment_intent?.status === "succeeded") {
        pi = stripeErr.payment_intent;
      } else {
        throw this.wrapStripeError(err);
      }
    }

    return { paymentIntentId: pi.id, status: pi.status, alreadyCaptured: false };
  }

  /**
   * Booking completion — persistence step. Manager-aware so the `/complete`
   * route handler can commit this in the SAME transaction as the commission
   * insert (see captureBookingPaymentStripeOnly's comment). A no-op (rather
   * than throwing) if the payment row is gone by the time this runs — the
   * Stripe capture already happened; there's nothing more useful to do than
   * log it, and the caller has already confirmed the row exists via the
   * Stripe-only phase moments earlier.
   */
  async markBookingPaymentCapturedInTx(
    manager: EntityManager,
    data: { bookingId: string; paymentIntentId: string },
  ): Promise<void> {
    const repo = manager.getRepository(Payment);
    const payment = await repo.findOne({
      where: { booking_id: data.bookingId, gateway_payment_id: data.paymentIntentId } as any,
    });
    if (!payment) return;
    (payment as any).status = "captured";
    (payment as any).captured_at = new Date();
    await repo.save(payment);
  }

  /**
   * Booking Payment rows are written exactly once per (booking_id,
   * gateway_payment_id) pair — reused on Stripe-idempotency-key retries
   * instead of inserted again, so captureBookingPayment/voidBookingPayment's
   * unordered `findOne({ booking_id, gateway_payment_id })` lookup can't
   * land on a stale duplicate row (review Fix 1/2). Only used by the
   * booking-payment write paths that can be minted more than once for the
   * same booking (setup / deposit-intent / off-session authorization) —
   * capture/void only ever update the row they already looked up.
   */
  private async saveBookingPayment(
    bookingId: string,
    gatewayPaymentId: string | null,
    fields: Record<string, unknown>,
  ): Promise<Payment> {
    const existing = gatewayPaymentId
      ? await this.paymentRepo.findOne({
          where: { booking_id: bookingId, gateway_payment_id: gatewayPaymentId } as any,
        })
      : null;

    if (existing) {
      return this.paymentRepo.save(Object.assign(existing, fields));
    }

    return this.paymentRepo.save({
      booking_id: bookingId,
      gateway_payment_id: gatewayPaymentId,
      ...fields,
    } as any);
  }

  /** Mirrors the raw-error wrapping createBookingOffSessionAuthorization
   * already does for its (business-outcome) decline path — here there's no
   * business-outcome branch, so a genuine Stripe SDK failure is rethrown as
   * a typed HttpError instead of propagating raw and collapsing to a
   * generic 500 in errorHandler (review Fix 3). */
  private wrapStripeError(err: unknown): HttpError {
    if (err instanceof HttpError) return err;
    const message = err instanceof Error ? err.message : "Stripe request failed";
    return new ServiceUnavailableError(message);
  }

  private buildTamaraCheckoutPayload(order: Order, redirectUrls?: TamaraRedirectUrls) {
    const anyOrder = order as any;
    const currency = anyOrder.currency ?? "AED";
    const shippingAddress = (anyOrder.shipping_address ?? {}) as Record<string, any>;
    const billingAddress = (anyOrder.billing_address ?? shippingAddress) as Record<string, any>;
    const user = anyOrder.user ?? {};
    const allowedOrigins = this.tamaraConfig!.allowedRedirectOrigins ?? [];
    const allowedOriginPatterns = this.tamaraConfig!.allowedRedirectOriginPatterns ?? [];

    return {
      total_amount: money(anyOrder.grand_total, currency),
      shipping_amount: money(anyOrder.shipping_total ?? 0, currency),
      tax_amount: money(anyOrder.tax_total ?? 0, currency),
      order_reference_id: anyOrder.id,
      order_number: anyOrder.order_number ?? anyOrder.id,
      description: `MaterialHub order ${anyOrder.order_number ?? anyOrder.id}`,
      items: (anyOrder.items ?? []).map((item: any) => ({
        name: String(item.product_name ?? "MaterialHub item").slice(0, 255),
        quantity: item.quantity,
        reference_id: item.product_id ?? item.id,
        type: "Physical",
        sku: String(item.product_sku ?? item.product_id ?? item.id).slice(0, 128),
        image_url: item.product_image_url ?? undefined,
        unit_price: money(item.unit_price, currency),
        tax_amount: money(item.tax_amount ?? 0, currency),
        discount_amount: money(item.discount_amount ?? 0, currency),
        total_amount: money(item.line_total ?? item.unit_price * item.quantity, currency),
      })),
      consumer: {
        first_name:
          user.first_name ?? shippingAddress.first_name ?? shippingAddress.full_name ?? "Customer",
        last_name: user.last_name ?? shippingAddress.last_name ?? ".",
        email: user.email ?? shippingAddress.email ?? "customer@materialhub.local",
        phone_number: user.phone ?? shippingAddress.phone ?? "",
      },
      country_code: shippingAddress.country_code ?? "AE",
      merchant_url: {
        success: resolveMerchantUrl(
          redirectUrls?.returnUrl,
          this.tamaraConfig!.successUrl,
          allowedOrigins,
          allowedOriginPatterns,
        ),
        failure: resolveMerchantUrl(
          redirectUrls?.failureUrl,
          this.tamaraConfig!.failureUrl,
          allowedOrigins,
          allowedOriginPatterns,
        ),
        cancel: resolveMerchantUrl(
          redirectUrls?.cancelUrl,
          this.tamaraConfig!.cancelUrl,
          allowedOrigins,
          allowedOriginPatterns,
        ),
        notification: this.tamaraConfig!.notificationUrl,
      },
      billing_address: tamaraAddress(billingAddress),
      shipping_address: tamaraAddress(shippingAddress),
      platform: "MaterialHub",
      is_mobile: anyOrder.channel === "mobile",
      locale: "en_US",
    };
  }
}

function money(amountFils: number | null | undefined, currency = "AED") {
  return { amount: ((amountFils ?? 0) / 100).toFixed(2), currency };
}

function tamaraAddress(address: Record<string, any>) {
  return {
    first_name: address.first_name ?? address.full_name ?? "Customer",
    last_name: address.last_name ?? ".",
    line1: address.address_line_1 ?? address.street ?? "",
    line2: address.address_line_2 ?? address.area ?? undefined,
    city: address.city ?? address.emirate ?? "",
    region: address.state ?? address.emirate ?? "",
    country_code: address.country_code ?? "AE",
    phone_number: address.phone ?? "",
  };
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

/**
 * Merchant redirect URLs reach Tamara from the client, and Tamara delivers the
 * customer to them after a real payment — so an unvalidated value is an open
 * redirect wearing MaterialHub's checkout as cover. Accept only same-origin
 * candidates; anything else silently uses the configured URL, which is a better
 * customer outcome than a 400 and gives an attacker no probing signal.
 */
function resolveMerchantUrl(
  candidate: string | undefined,
  fallback: string,
  allowedOrigins: string[],
  allowedOriginPatterns: RegExp[] = [],
): string {
  if (!candidate) return fallback;
  let origin: string;
  try {
    origin = new URL(candidate).origin;
  } catch {
    // Include the allowlist so this warning distinguishes "the allowlist is
    // empty/misconfigured" from "a caller sent a genuinely malformed URL".
    console.warn(
      `[tamara] discarding unparseable merchant URL, using configured fallback. Allowed origins: [${allowedOrigins.join(", ")}]`,
    );
    return fallback;
  }
  const allowed =
    allowedOrigins.includes(origin) ||
    allowedOriginPatterns.some((pattern) => pattern.test(origin));
  if (!allowed) {
    console.warn(
      `[tamara] discarding merchant URL with disallowed origin: ${origin}. Allowed origins: [${allowedOrigins.join(", ")}]`,
    );
    return fallback;
  }
  return candidate;
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
