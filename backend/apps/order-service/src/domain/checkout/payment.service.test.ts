// payment.service.test.ts
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { PaymentService } from "./payment.service.ts";

describe("PaymentService", () => {
  const mockPaymentRepo = {
    save: mock((p: any) => Promise.resolve({ id: "pay-1", ...p })),
  };
  const mockStripe = {
    paymentIntents: {
      create: mock(() =>
        Promise.resolve({
          id: "pi_test",
          client_secret: "pi_test_secret_123",
          status: "requires_payment_method",
        }),
      ),
    },
  };
  const mockOrderRepo = {
    findOne: mock((_args?: any) =>
      Promise.resolve({
        id: "order-1",
        order_number: "NL-1001",
        user_id: "user-1",
        status: "pending_payment",
        payment_status: "pending",
        grand_total: 15000,
        shipping_total: 1000,
        tax_total: 714,
        discount_total: 500,
        currency: "AED",
        shipping_address: {
          first_name: "Aisha",
          last_name: "Khan",
          phone: "+971501234567",
          address_line_1: "Marina Walk",
          city: "Dubai",
          country_code: "AE",
        },
        billing_address: null,
        user: {
          first_name: "Aisha",
          last_name: "Khan",
          email: "aisha@example.com",
          phone: "+971501234567",
        },
        items: [
          {
            id: "item-1",
            product_name: "Linen Dress",
            product_sku: "LINEN-1",
            product_id: "prod-1",
            quantity: 1,
            unit_price: 15000,
            tax_amount: 714,
            discount_amount: 500,
            line_total: 15000,
            product_image_url: "https://cdn.materialhub.test/linen.jpg",
          },
        ],
      }),
    ),
  };
  const mockTamaraFetch = mock(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          order_id: "tamara-order-1",
          checkout_id: "tamara-checkout-1",
          status: "new",
          checkout_url: "https://checkout.tamara.co/session/tamara-checkout-1",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ),
  );

  let service: PaymentService;

  function tamaraRequestBody() {
    const [, requestInit] = (
      mockTamaraFetch.mock.calls as unknown as Array<[string, RequestInit]>
    )[0]!;
    return JSON.parse(String(requestInit.body));
  }

  beforeEach(() => {
    mockPaymentRepo.save.mockClear();
    mockStripe.paymentIntents.create.mockClear();
    mockOrderRepo.findOne.mockClear();
    mockTamaraFetch.mockClear();
    service = new PaymentService(mockPaymentRepo as any, mockStripe as any);
  });

  it("creates a Stripe PaymentIntent and saves payment record", async () => {
    const result = await service.createStripePaymentIntent({
      orderId: "order-1",
      userId: "user-1",
      amount: 15000,
      currency: "aed",
    });
    expect(result.clientSecret).toBe("pi_test_secret_123");
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 15000,
        currency: "aed",
        metadata: expect.objectContaining({ order_id: "order-1" }),
      }),
    );
    expect(mockPaymentRepo.save).toHaveBeenCalled();
  });

  it("uses a static Stripe shipping postal code when checkout address has none", async () => {
    service = new PaymentService(
      mockPaymentRepo as unknown as ConstructorParameters<typeof PaymentService>[0],
      mockStripe as unknown as ConstructorParameters<typeof PaymentService>[1],
      mockOrderRepo as unknown as ConstructorParameters<typeof PaymentService>[2],
    );

    await service.createStripePaymentIntent({
      orderId: "order-1",
      userId: "user-1",
      amount: 15000,
      currency: "aed",
    });

    expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        shipping: expect.objectContaining({
          address: expect.objectContaining({
            postal_code: "00000",
          }),
        }),
      }),
    );
  });

  it("creates a COD payment record with pending status", async () => {
    const result = await service.createCodPayment({
      orderId: "order-1",
      userId: "user-1",
      amount: 15000,
    });
    expect(result.status).toBe("pending");
    expect(mockPaymentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_method: "cash_on_delivery",
        status: "pending",
      }),
    );
  });

  it("creates a Tabby BNPL session", async () => {
    const result = await service.createTabbySession({
      orderId: "order-1",
      userId: "user-1",
      amount: 15000,
    });
    expect(result.checkoutUrl).toContain("tabby");
    expect(result.sessionId).toBeTruthy();
    expect(mockPaymentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ payment_method: "tabby", gateway: "tabby" }),
    );
  });

  it("creates a Tamara checkout session through Tamara and stores returned ids", async () => {
    service = new PaymentService(mockPaymentRepo as any, mockStripe as any, mockOrderRepo as any, {
      apiToken: "tamara-token",
      apiBaseUrl: "https://api-sandbox.tamara.co",
      successUrl: "https://www.materialhub.test/checkout/tamara/success",
      failureUrl: "https://www.materialhub.test/checkout/tamara/failure",
      cancelUrl: "https://www.materialhub.test/checkout/tamara/cancel",
      notificationUrl: "https://api.materialhub.test/webhooks/tamara",
      fetch: mockTamaraFetch as any,
    });

    const result = await service.createTamaraSession({
      orderId: "order-1",
      userId: "user-1",
      amount: 15000,
    });

    expect(result).toEqual({
      checkoutUrl: "https://checkout.tamara.co/session/tamara-checkout-1",
      orderId: "tamara-order-1",
      checkoutId: "tamara-checkout-1",
      status: "new",
    });
    expect(mockTamaraFetch).toHaveBeenCalledWith(
      "https://api-sandbox.tamara.co/checkout",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer tamara-token" }),
      }),
    );
    const request = tamaraRequestBody();
    expect(request.order_reference_id).toBe("order-1");
    expect(request.order_number).toBe("NL-1001");
    expect(request.total_amount).toEqual({ amount: "150.00", currency: "AED" });
    expect(request.consumer).toEqual(
      expect.objectContaining({
        first_name: "Aisha",
        last_name: "Khan",
        email: "aisha@example.com",
        phone_number: "+971501234567",
      }),
    );
    expect(mockPaymentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_method: "tamara",
        gateway: "tamara",
        gateway_order_id: "tamara-order-1",
        gateway_payment_id: "tamara-checkout-1",
        three_ds_redirect_url: "https://checkout.tamara.co/session/tamara-checkout-1",
      }),
    );
  });

  const tamaraConfigWithOrigins = {
    apiToken: "tamara-token",
    apiBaseUrl: "https://api-sandbox.tamara.co",
    successUrl: "https://www.materialhub.test/checkout/tamara/success",
    failureUrl: "https://www.materialhub.test/checkout/tamara/failure",
    cancelUrl: "https://www.materialhub.test/checkout/tamara/cancel",
    notificationUrl: "https://api.materialhub.test/webhooks/tamara",
    allowedRedirectOrigins: ["https://www.materialhub.test"],
  };

  it("uses caller-supplied merchant URLs when their origin is allowed", async () => {
    service = new PaymentService(mockPaymentRepo as any, mockStripe as any, mockOrderRepo as any, {
      ...tamaraConfigWithOrigins,
      fetch: mockTamaraFetch as any,
    });

    await service.createTamaraSession({
      orderId: "order-1",
      userId: "user-1",
      amount: 15000,
      redirectUrls: {
        returnUrl: "https://www.materialhub.test/en/account/orders/order-1",
        failureUrl: "https://www.materialhub.test/en/checkout/tamara/failure?order=order-1",
        cancelUrl: "https://www.materialhub.test/en/checkout/tamara/cancel?order=order-1",
      },
    });

    expect(tamaraRequestBody().merchant_url).toEqual({
      success: "https://www.materialhub.test/en/account/orders/order-1",
      failure: "https://www.materialhub.test/en/checkout/tamara/failure?order=order-1",
      cancel: "https://www.materialhub.test/en/checkout/tamara/cancel?order=order-1",
      notification: "https://api.materialhub.test/webhooks/tamara",
    });
  });

  it("falls back to configured merchant URLs for a foreign origin", async () => {
    service = new PaymentService(mockPaymentRepo as any, mockStripe as any, mockOrderRepo as any, {
      ...tamaraConfigWithOrigins,
      fetch: mockTamaraFetch as any,
    });

    await service.createTamaraSession({
      orderId: "order-1",
      userId: "user-1",
      amount: 15000,
      redirectUrls: {
        returnUrl: "https://evil.example.com/steal",
        failureUrl: "https://evil.example.com/steal",
        cancelUrl: "https://evil.example.com/steal",
      },
    });

    expect(tamaraRequestBody().merchant_url).toEqual({
      success: "https://www.materialhub.test/checkout/tamara/success",
      failure: "https://www.materialhub.test/checkout/tamara/failure",
      cancel: "https://www.materialhub.test/checkout/tamara/cancel",
      notification: "https://api.materialhub.test/webhooks/tamara",
    });
  });

  it("falls back to configured merchant URLs for an unparseable URL", async () => {
    service = new PaymentService(mockPaymentRepo as any, mockStripe as any, mockOrderRepo as any, {
      ...tamaraConfigWithOrigins,
      fetch: mockTamaraFetch as any,
    });

    await service.createTamaraSession({
      orderId: "order-1",
      userId: "user-1",
      amount: 15000,
      redirectUrls: { returnUrl: "/en/account/orders/order-1" },
    });

    expect(tamaraRequestBody().merchant_url.success).toBe(
      "https://www.materialhub.test/checkout/tamara/success",
    );
  });

  it("falls back to configured merchant URLs when the caller supplies none", async () => {
    service = new PaymentService(mockPaymentRepo as any, mockStripe as any, mockOrderRepo as any, {
      ...tamaraConfigWithOrigins,
      fetch: mockTamaraFetch as any,
    });

    await service.createTamaraSession({ orderId: "order-1", userId: "user-1", amount: 15000 });

    expect(tamaraRequestBody().merchant_url.success).toBe(
      "https://www.materialhub.test/checkout/tamara/success",
    );
  });

  // C2 final-review fix — createTamaraSession must reject a session on an
  // order that is no longer payable (e.g. cancelled by pending-order-reaper
  // after a decline, then the customer clicks "Try Tamara again"). Without
  // this, the retry flow could charge a customer for a cancelled order with
  // no inventory reserved. Covers both halves of the predicate.
  it.each([
    ["cancelled", "pending", "status is not pending_payment"],
    ["pending_payment", "captured", "payment_status is already captured"],
  ])(
    "C2: rejects createTamaraSession with 409 ORDER_NOT_PAYABLE when %s",
    async (status, paymentStatus) => {
      const baseOrder = await mockOrderRepo.findOne();
      const notPayableOrderRepo = {
        findOne: mock((_args?: any) =>
          Promise.resolve({
            ...baseOrder,
            id: "order-1",
            status,
            payment_status: paymentStatus,
          }),
        ),
      };

      service = new PaymentService(
        mockPaymentRepo as any,
        mockStripe as any,
        notPayableOrderRepo as any,
        {
          ...tamaraConfigWithOrigins,
          fetch: mockTamaraFetch as any,
        },
      );

      await expect(
        service.createTamaraSession({ orderId: "order-1", userId: "user-1" }),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "ORDER_NOT_PAYABLE",
      });

      expect(mockTamaraFetch).not.toHaveBeenCalled();
      expect(mockPaymentRepo.save).not.toHaveBeenCalled();
    },
  );
});

describe("PaymentService booking payments (Phase 4 Task 2)", () => {
  // In-memory Payment table stand-in — filters findOne by (booking_id,
  // gateway_payment_id) like the real repo's `where` clause, and save()
  // updates the matching row in place when one is passed with an `id`
  // (mirrors saveBookingPayment's find-then-save dedup). This is required
  // (rather than a dumb always-resolves mock) to actually exercise the
  // review Fix 1/2 no-duplicate-row behavior below.
  let rows: any[] = [];
  let nextRowId = 1;

  const mockPaymentRepo = {
    save: mock(async (p: any) => {
      if (p.id) {
        const idx = rows.findIndex((r) => r.id === p.id);
        if (idx >= 0) {
          rows[idx] = { ...rows[idx], ...p };
          return rows[idx];
        }
      }
      const row = { id: `pay-booking-${nextRowId++}`, ...p };
      rows.push(row);
      return row;
    }),
    findOne: mock(async (args?: any) => {
      const where = args?.where ?? {};
      return (
        rows.find(
          (r) =>
            (where.booking_id === undefined || r.booking_id === where.booking_id) &&
            (where.gateway_payment_id === undefined ||
              r.gateway_payment_id === where.gateway_payment_id),
        ) ?? null
      );
    }),
  };
  const mockStripe = {
    customers: {
      create: mock(async () => ({ id: "cus_test_1" }) as any),
    },
    setupIntents: {
      create: mock(
        async () =>
          ({
            id: "seti_test_1",
            client_secret: "seti_test_1_secret_abc",
          }) as any,
      ),
    },
    paymentIntents: {
      create: mock(
        async () =>
          ({
            id: "pi_booking_test",
            status: "requires_capture",
            client_secret: "pi_booking_test_secret",
          }) as any,
      ),
      capture: mock(async () => ({ id: "pi_booking_test", status: "succeeded" }) as any),
      cancel: mock(async () => ({ id: "pi_booking_test", status: "canceled" }) as any),
    },
  };

  let service: PaymentService;

  beforeEach(() => {
    rows = [];
    nextRowId = 1;
    mockPaymentRepo.save.mockClear();
    mockPaymentRepo.findOne.mockClear();
    mockStripe.customers.create.mockClear();
    mockStripe.setupIntents.create.mockClear();
    mockStripe.paymentIntents.create.mockClear();
    mockStripe.paymentIntents.capture.mockClear();
    mockStripe.paymentIntents.cancel.mockClear();
    service = new PaymentService(mockPaymentRepo as any, mockStripe as any);
  });

  it("createBookingSetupIntent mints a Stripe customer, creates an off-session SetupIntent, records a booking Payment row", async () => {
    const result = await service.createBookingSetupIntent({
      bookingId: "booking-1",
      userId: "user-1",
      email: "customer@example.com",
    });

    expect(mockStripe.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: "customer@example.com" }),
      expect.objectContaining({ idempotencyKey: "booking-setup-customer:booking-1" }),
    );
    expect(mockStripe.setupIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_test_1",
        usage: "off_session",
        metadata: expect.objectContaining({ booking_id: "booking-1" }),
      }),
      expect.objectContaining({ idempotencyKey: "booking-setup:booking-1" }),
    );
    expect(result.clientSecret).toBe("seti_test_1_secret_abc");
    expect(result.customerId).toBe("cus_test_1");
    expect(mockPaymentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        booking_id: "booking-1",
        order_id: null,
        gateway_payment_id: "seti_test_1",
      }),
    );
  });

  it("createBookingSetupIntent reuses an existing Stripe customer when provided", async () => {
    await service.createBookingSetupIntent({
      bookingId: "booking-1",
      userId: "user-1",
      email: "customer@example.com",
      stripeCustomerId: "cus_existing",
    });

    expect(mockStripe.customers.create).not.toHaveBeenCalled();
    expect(mockStripe.setupIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_existing" }),
      expect.objectContaining({ idempotencyKey: "booking-setup:booking-1" }),
    );
  });

  it("createBookingSetupIntent reuses the same Payment row instead of inserting a duplicate when retried (same SetupIntent id)", async () => {
    // Simulates a network-timeout retry: Stripe replays the same SetupIntent
    // id for the matching idempotency key, so the second call must update
    // the row the first call created rather than insert a second one.
    const first = await service.createBookingSetupIntent({
      bookingId: "booking-1",
      userId: "user-1",
      email: "customer@example.com",
    });
    const second = await service.createBookingSetupIntent({
      bookingId: "booking-1",
      userId: "user-1",
      email: "customer@example.com",
    });

    expect(second.paymentId).toBe(first.paymentId);
    expect(
      rows.filter((r) => r.booking_id === "booking-1" && r.gateway_payment_id === "seti_test_1"),
    ).toHaveLength(1);
  });

  it("createBookingSetupIntent wraps a raw Stripe error as an HttpError instead of letting it propagate", async () => {
    mockStripe.setupIntents.create.mockImplementationOnce(async () => {
      throw new Error("Stripe API is down");
    });

    await expect(
      service.createBookingSetupIntent({
        bookingId: "booking-err",
        userId: "user-1",
        email: "customer@example.com",
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });

  it("createBookingOffSessionAuthorization creates a manual-capture off-session PaymentIntent and records it as authorized", async () => {
    const result = await service.createBookingOffSessionAuthorization({
      bookingId: "booking-1",
      userId: "user-1",
      stripeCustomerId: "cus_test_1",
      paymentMethodId: "pm_test_1",
      amountFils: 10000,
    });

    expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 10000,
        customer: "cus_test_1",
        payment_method: "pm_test_1",
        capture_method: "manual",
        confirm: true,
        off_session: true,
        metadata: expect.objectContaining({ booking_id: "booking-1" }),
      }),
      expect.objectContaining({ idempotencyKey: "booking-authorize:booking-1" }),
    );
    expect(result.status).toBe("requires_capture");
    expect(result.paymentIntentId).toBe("pi_booking_test");
    expect(mockPaymentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: "authorized", booking_id: "booking-1", order_id: null }),
    );
  });

  it("createBookingOffSessionAuthorization does not insert a duplicate Payment row when retried with the same PaymentIntent id", async () => {
    // Stripe's idempotency key already prevents a second PaymentIntent — this
    // proves the *local* Payment row write is idempotent too (review Fix 1):
    // captureBookingPayment/voidBookingPayment's unordered findOne({
    // booking_id, gateway_payment_id }) must land on a single, unambiguous row.
    const first = await service.createBookingOffSessionAuthorization({
      bookingId: "booking-1",
      userId: "user-1",
      stripeCustomerId: "cus_test_1",
      paymentMethodId: "pm_test_1",
      amountFils: 10000,
    });
    const second = await service.createBookingOffSessionAuthorization({
      bookingId: "booking-1",
      userId: "user-1",
      stripeCustomerId: "cus_test_1",
      paymentMethodId: "pm_test_1",
      amountFils: 10000,
    });

    expect(second.paymentId).toBe(first.paymentId);
    expect(
      rows.filter(
        (r) => r.booking_id === "booking-1" && r.gateway_payment_id === "pi_booking_test",
      ),
    ).toHaveLength(1);
  });

  it("createBookingOffSessionAuthorization records a failed Payment row (not a thrown error) when Stripe declines off-session", async () => {
    mockStripe.paymentIntents.create.mockImplementationOnce(async () => {
      const err: any = new Error("Your card was declined.");
      err.type = "StripeCardError";
      err.payment_intent = { id: "pi_declined", status: "requires_payment_method" };
      throw err;
    });

    const result = await service.createBookingOffSessionAuthorization({
      bookingId: "booking-1",
      userId: "user-1",
      stripeCustomerId: "cus_test_1",
      paymentMethodId: "pm_test_1",
      amountFils: 10000,
    });

    expect(result.status).toBe("requires_payment_method");
    expect(result.paymentIntentId).toBe("pi_declined");
    expect(result.failureReason).toBe("Your card was declined.");
    expect(mockPaymentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", gateway_payment_id: "pi_declined" }),
    );
  });

  it("createBookingDepositIntent creates a capture-now (automatic) PaymentIntent", async () => {
    const result = await service.createBookingDepositIntent({
      bookingId: "booking-2",
      userId: "user-1",
      amountFils: 5000,
    });

    expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 5000,
        metadata: expect.objectContaining({ booking_id: "booking-2" }),
        automatic_payment_methods: { enabled: true },
      }),
      expect.objectContaining({ idempotencyKey: "booking-intent:booking-2" }),
    );
    expect(result.clientSecret).toBe("pi_booking_test_secret");
    expect(mockPaymentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ booking_id: "booking-2", order_id: null, status: "pending" }),
    );
  });

  it("createBookingDepositIntent wraps a raw Stripe error as an HttpError instead of letting it propagate", async () => {
    mockStripe.paymentIntents.create.mockImplementationOnce(async () => {
      throw new Error("Stripe API is down");
    });

    await expect(
      service.createBookingDepositIntent({
        bookingId: "booking-err",
        userId: "user-1",
        amountFils: 5000,
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });

  it("captureBookingPayment captures the PI and marks the Payment row captured", async () => {
    rows.push({
      id: "pay-booking-1",
      booking_id: "booking-1",
      gateway: "stripe",
      gateway_payment_id: "pi_booking_test",
      status: "authorized",
      amount: 10000,
    });

    const result = await service.captureBookingPayment({
      bookingId: "booking-1",
      paymentIntentId: "pi_booking_test",
    });

    expect(mockStripe.paymentIntents.capture).toHaveBeenCalledWith(
      "pi_booking_test",
      undefined,
      expect.objectContaining({ idempotencyKey: "booking-capture:pi_booking_test" }),
    );
    expect(result.status).toBe("succeeded");
    expect(mockPaymentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: "captured" }),
    );
  });

  it("captureBookingPayment passes amountFils through as a partial capture", async () => {
    rows.push({
      id: "pay-booking-1",
      booking_id: "booking-1",
      gateway: "stripe",
      gateway_payment_id: "pi_booking_test",
      status: "authorized",
      amount: 10000,
    });

    await service.captureBookingPayment({
      bookingId: "booking-1",
      paymentIntentId: "pi_booking_test",
      amountFils: 4000,
    });

    expect(mockStripe.paymentIntents.capture).toHaveBeenCalledWith(
      "pi_booking_test",
      { amount_to_capture: 4000 },
      expect.objectContaining({ idempotencyKey: "booking-capture:pi_booking_test" }),
    );
  });

  it("captureBookingPayment throws NotFoundError when no matching payment row exists", async () => {
    await expect(
      service.captureBookingPayment({ bookingId: "booking-x", paymentIntentId: "pi_missing" }),
    ).rejects.toThrow(/no payment found/i);
  });

  it("captureBookingPayment wraps a raw Stripe error as an HttpError instead of letting it propagate", async () => {
    rows.push({
      id: "pay-booking-1",
      booking_id: "booking-1",
      gateway: "stripe",
      gateway_payment_id: "pi_booking_test",
      status: "authorized",
      amount: 10000,
    });
    mockStripe.paymentIntents.capture.mockImplementationOnce(async () => {
      throw new Error("Stripe API is down");
    });

    await expect(
      service.captureBookingPayment({ bookingId: "booking-1", paymentIntentId: "pi_booking_test" }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });

  it("voidBookingPayment cancels the PI and marks the Payment row cancelled", async () => {
    rows.push({
      id: "pay-booking-1",
      booking_id: "booking-1",
      gateway: "stripe",
      gateway_payment_id: "pi_booking_test",
      status: "authorized",
      amount: 10000,
    });

    const result = await service.voidBookingPayment({
      bookingId: "booking-1",
      paymentIntentId: "pi_booking_test",
    });

    expect(mockStripe.paymentIntents.cancel).toHaveBeenCalledWith(
      "pi_booking_test",
      expect.objectContaining({ idempotencyKey: "booking-void:pi_booking_test" }),
    );
    expect(result.status).toBe("canceled");
    expect(mockPaymentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: "cancelled" }),
    );
  });

  it("voidBookingPayment throws NotFoundError when no matching payment row exists", async () => {
    await expect(
      service.voidBookingPayment({ bookingId: "booking-x", paymentIntentId: "pi_missing" }),
    ).rejects.toThrow(/no payment found/i);
  });

  it("voidBookingPayment wraps a raw Stripe error as an HttpError instead of letting it propagate", async () => {
    rows.push({
      id: "pay-booking-1",
      booking_id: "booking-1",
      gateway: "stripe",
      gateway_payment_id: "pi_booking_test",
      status: "authorized",
      amount: 10000,
    });
    mockStripe.paymentIntents.cancel.mockImplementationOnce(async () => {
      throw new Error("Stripe API is down");
    });

    await expect(
      service.voidBookingPayment({ bookingId: "booking-1", paymentIntentId: "pi_booking_test" }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});
