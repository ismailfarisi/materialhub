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
