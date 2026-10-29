// checkout.service.test.ts
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { CheckoutService } from "./checkout.service.ts";

describe("CheckoutService", () => {
  const defaultCartImpl = (_args?: any): Promise<any> =>
    Promise.resolve({
      cart: { id: "cart-1", subtotal: 10000, item_count: 2 },
      items: [
        {
          vendor_id: "v1",
          items: [
            {
              id: "ci-1",
              vendor_id: "v1",
              product_id: "p1",
              variant_id: "v1",
              quantity: 2,
              unit_price: 5000,
              line_total: 10000,
              product: { name: "Test", category_id: "cat-1" },
            },
          ],
        },
      ],
      staleItems: [] as string[],
    });
  const mockCartService = {
    getCart: mock(defaultCartImpl),
    clearCart: mock(() => Promise.resolve()),
    setCoupon: mock(() => Promise.resolve()),
    clearCoupon: mock(() => Promise.resolve()),
  };
  const mockTaxService = {
    getRate: mock(() => Promise.resolve(5)),
    calculateTax: mock((amt: number, rate: number) => Math.round((amt * rate) / 100)),
  };
  const mockShippingService = {
    calculateShipping: mock(() => Promise.resolve({ cost: 1500, rate: {} })),
  };
  const mockCouponService = {
    validate: mock((..._args: any[]) =>
      Promise.resolve({
        couponId: "c1",
        code: "SAVE10",
        type: "percentage",
        discount: 1000,
        vendorId: null,
      }),
    ),
    recordUsage: mock(() => Promise.resolve()),
  };
  let capturedCreateOrderArgs: any;
  const mockOrderCreationService = {
    createOrder: mock((args: any) => {
      capturedCreateOrderArgs = args;
      return Promise.resolve({ order: { id: "o1", grand_total: 10500 }, vendorOrders: [] });
    }),
  };
  const mockPaymentService = {
    createStripePaymentIntent: mock(() =>
      Promise.resolve({ clientSecret: "secret", paymentIntentId: "pi_1" }),
    ),
    createCodPayment: mock(() => Promise.resolve({ status: "pending" })),
    createTamaraSession: mock(() =>
      Promise.resolve({
        checkoutUrl: "https://checkout.tamara.co/s/1",
        orderId: "tamara-order-1",
        checkoutId: "tamara-checkout-1",
        status: "new",
      }),
    ),
  };
  const mockQuoteService = {
    rulesEpochService: { get: mock(() => Promise.resolve(1)) },
    validateQuoteToken: mock(() => Promise.resolve(true)),
    buildQuote: mock(() =>
      Promise.resolve({
        response: { schema_version: 1, quote_token: "q_fresh.2024", payment_methods: [] },
        etag: '"etag"',
        cartHash: "hash",
        rulesEpoch: 2,
      }),
    ),
  };

  const mockOrderConfirmation = {
    markOrderPaid: mock(() => Promise.resolve({ confirmed: true })),
    clearCustomerCart: mock(() => Promise.resolve()),
    triggerAutoShipments: mock(() => Promise.resolve()),
    emitOrderPlaced: mock(() => Promise.resolve()),
    recordCouponUsage: mock(() => Promise.resolve()),
  };

  // COD threshold row (active) with a 1000-fils surcharge.
  const mockThresholdRepo = {
    findOne: mock(() =>
      Promise.resolve({
        provider: "cod",
        is_active: true,
        surcharge_fils: 1000,
        max_amount_fils: 500000,
        min_amount_fils: 0,
      }),
    ),
  };
  // One platform-default standard rate: base_cost 1500, free_above 15000.
  const standardRate = {
    id: "rate-1",
    vendor_id: null,
    zone_id: null,
    method: "standard",
    base_cost: 1500,
    per_kg_cost: null,
    free_above: 15000,
    estimated_days_min: 2,
    estimated_days_max: 5,
  };
  const mockShippingRateRepo = {
    createQueryBuilder: mock(() => {
      const qb: any = {
        where: () => qb,
        andWhere: () => qb,
        getMany: () => Promise.resolve([standardRate]),
      };
      return qb;
    }),
  };
  // Address resolves to no zone (platform-default rates apply).
  const mockUserAddressRepo = {
    findOne: mock(() => Promise.resolve({ area_id: null })),
  };

  let service: CheckoutService;

  beforeEach(() => {
    for (const svc of [
      mockCartService,
      mockTaxService,
      mockShippingService,
      mockCouponService,
      mockOrderCreationService,
      mockPaymentService,
      mockQuoteService,
      mockOrderConfirmation,
    ]) {
      Object.values(svc).forEach((m) =>
        typeof m === "object"
          ? Object.values(m as any).forEach((n: any) => n.mockClear?.())
          : (m as any).mockClear(),
      );
    }
    capturedCreateOrderArgs = undefined;
    mockCartService.getCart.mockImplementation(defaultCartImpl);
    service = new CheckoutService(
      mockCartService as any,
      mockTaxService as any,
      mockShippingService as any,
      mockCouponService as any,
      mockOrderCreationService as any,
      mockPaymentService as any,
      mockQuoteService as any,
      mockOrderConfirmation as any,
      mockThresholdRepo as any,
      mockShippingRateRepo as any,
      mockUserAddressRepo as any,
    );
  });

  it("initiates checkout: validates cart, calculates totals, creates order", async () => {
    const result = await service.initiateCheckout({
      userId: "user-1",
      shippingAddress: { city: "Dubai", emirate: "Dubai" },
      shippingMethod: "standard",
      channel: "web",
    });
    expect(mockCartService.getCart).toHaveBeenCalled();
    // taxService.getRate is no longer called — VAT is extracted from
    // VAT-inclusive product prices, not added on top.
    expect(mockOrderCreationService.createOrder).toHaveBeenCalled();
    expect((result as { orderId: string }).orderId).toBe("o1");
  });

  it("includes COD surcharge and rate-based shipping in the initiated order", async () => {
    await service.initiateCheckout({
      userId: "u1",
      shippingAddress: { city: "Dubai" },
      channel: "web",
      paymentMethod: "cod",
      address_id: "addr-1",
    });
    expect(capturedCreateOrderArgs.surchargeTotal).toBe(1000);
    expect(capturedCreateOrderArgs.shippingTotal).toBe(1500);
  });

  it("rejects COD when the cart exceeds the COD max threshold", async () => {
    // Cart subtotal (10000) above the COD max (5000) → server must reject even
    // though the UI/quote already mark COD unavailable.
    mockThresholdRepo.findOne.mockResolvedValueOnce({
      provider: "cod",
      is_active: true,
      surcharge_fils: 1000,
      max_amount_fils: 5000,
      min_amount_fils: 0,
    } as any);
    await expect(
      service.initiateCheckout({
        userId: "u1",
        shippingAddress: { city: "Dubai" },
        channel: "web",
        paymentMethod: "cod",
        address_id: "addr-1",
      }),
    ).rejects.toThrow("Cash on delivery is not available for this order amount");
    expect(mockOrderCreationService.createOrder).not.toHaveBeenCalled();
  });

  it("rejects COD when there is no active COD threshold row", async () => {
    mockThresholdRepo.findOne.mockResolvedValueOnce(null as any);
    await expect(
      service.initiateCheckout({
        userId: "u1",
        shippingAddress: { city: "Dubai" },
        channel: "web",
        paymentMethod: "cash_on_delivery",
        address_id: "addr-1",
      }),
    ).rejects.toThrow("Cash on delivery is not available");
    expect(mockOrderCreationService.createOrder).not.toHaveBeenCalled();
  });

  it("does not charge shipping when no address is provided (matches the quote)", async () => {
    await service.initiateCheckout({
      userId: "u1",
      shippingAddress: { city: "Dubai" },
      channel: "web",
    });
    expect(capturedCreateOrderArgs.shippingTotal).toBe(0);
  });

  it("rejects checkout when cart is empty", async () => {
    mockCartService.getCart.mockResolvedValueOnce({
      cart: { id: "cart-1", subtotal: 0, item_count: 0 },
      items: [],
      staleItems: [],
    });
    await expect(
      service.initiateCheckout({ userId: "user-1", shippingAddress: {}, channel: "web" }),
    ).rejects.toThrow("empty");
  });

  it("returns 409 + fresh_quote when quote_token validation fails", async () => {
    mockQuoteService.validateQuoteToken.mockResolvedValueOnce(false);
    const result = await service.initiateCheckout({
      userId: "user-1",
      shippingAddress: { city: "Dubai", emirate: "Dubai" },
      channel: "web",
      quote_token: "q_stale.2024-01-01T00:00:00.000Z",
      address_id: "00000000-0000-0000-0000-000000000001",
    });
    expect((result as any).status).toBe(409);
    expect((result as any).error.reason_key).toBe("checkout.error.quote_token_stale");
    expect((result as any).fresh_quote).toBeDefined();
    expect(mockQuoteService.buildQuote).toHaveBeenCalled();
  });

  it("createPaymentIntent: clears the customer's cart for cash_on_delivery", async () => {
    // COD has no async webhook — the customer is committed at this point, so
    // the cart must be drained immediately. Stripe path skips this because
    // the webhook will clear via OrderConfirmationService.markOrderPaid.
    await service.createPaymentIntent("order-1", "user-cod", 12000, "cash_on_delivery");

    expect(mockPaymentService.createCodPayment).toHaveBeenCalled();
    expect(mockOrderConfirmation.clearCustomerCart).toHaveBeenCalledWith("user-cod");
  });

  it("createPaymentIntent: does NOT clear the cart for Stripe (webhook owns that)", async () => {
    await service.createPaymentIntent("order-1", "user-stripe", 12000, "credit_card");

    expect(mockPaymentService.createStripePaymentIntent).toHaveBeenCalled();
    expect(mockOrderConfirmation.clearCustomerCart).not.toHaveBeenCalled();
  });

  it("createPaymentIntent: triggers auto shipment booking for cash_on_delivery", async () => {
    // COD ships before payment is captured — the customer pays the courier.
    await service.createPaymentIntent("order-1", "user-cod", 12000, "cash_on_delivery");

    expect(mockOrderConfirmation.triggerAutoShipments).toHaveBeenCalledWith("order-1");
  });

  it("createPaymentIntent: emits the order-placed event for cash_on_delivery", async () => {
    // COD has no payment webhook, so the order-placed emails must be triggered
    // here — at placement. Prepaid paths emit from markOrderPaid instead.
    await service.createPaymentIntent("order-1", "user-cod", 12000, "cash_on_delivery");

    expect(mockOrderConfirmation.emitOrderPlaced).toHaveBeenCalledWith("order-1", "user-cod");
  });

  it("createPaymentIntent: does NOT emit the order-placed event for Stripe", async () => {
    // Prepaid emits only after payment capture (markOrderPaid), never here.
    await service.createPaymentIntent("order-1", "user-stripe", 12000, "credit_card");

    expect(mockOrderConfirmation.emitOrderPlaced).not.toHaveBeenCalled();
  });

  it("createPaymentIntent: does NOT trigger auto shipments for Stripe (webhook owns that)", async () => {
    await service.createPaymentIntent("order-1", "user-stripe", 12000, "credit_card");

    expect(mockOrderConfirmation.triggerAutoShipments).not.toHaveBeenCalled();
  });

  it("forwards all three Tamara redirect URLs to the payment service", async () => {
    await service.createPaymentIntent("order-1", "user-1", 15000, "tamara", {
      returnUrl: "https://www.materialhub.test/en/account/orders/order-1",
      failureUrl: "https://www.materialhub.test/en/checkout/tamara/failure?order=order-1",
      cancelUrl: "https://www.materialhub.test/en/checkout/tamara/cancel?order=order-1",
    });

    expect(mockPaymentService.createTamaraSession).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "order-1",
        userId: "user-1",
        amount: 15000,
        redirectUrls: {
          returnUrl: "https://www.materialhub.test/en/account/orders/order-1",
          failureUrl: "https://www.materialhub.test/en/checkout/tamara/failure?order=order-1",
          cancelUrl: "https://www.materialhub.test/en/checkout/tamara/cancel?order=order-1",
        },
      }),
    );
  });

  it("applyCoupon validates against the cart and persists the coupon on it", async () => {
    const result = await service.applyCoupon("user-1", undefined, "save10");
    expect(mockCouponService.validate).toHaveBeenCalledWith("save10", "user-1", [
      { product_id: "p1", vendor_id: "v1", quantity: 2, line_total: 10000 },
    ]);
    expect(mockCartService.setCoupon).toHaveBeenCalledWith("user-1", null, {
      couponId: "c1",
      code: "SAVE10",
      discount: 1000,
    });
    expect(result).toEqual({ discount: 1000, code: "SAVE10", type: "percentage" });
  });

  it("removeCoupon clears the coupon from the cart", async () => {
    await service.removeCoupon("user-1");
    expect(mockCartService.clearCoupon).toHaveBeenCalledWith("user-1", null);
  });

  it("initiateCheckout re-validates the cart coupon and charges the fresh discount", async () => {
    mockCartService.getCart.mockResolvedValue({
      cart: {
        id: "cart-1",
        subtotal: 10000,
        item_count: 2,
        coupon_id: "c1",
        coupon_code: "SAVE10",
        coupon_discount: 9999, // stale snapshot — must NOT be charged
      },
      items: [
        {
          vendor_id: "v1",
          items: [
            {
              id: "ci-1",
              vendor_id: "v1",
              product_id: "p1",
              variant_id: "v1",
              quantity: 2,
              unit_price: 5000,
              line_total: 10000,
              product: { name: "Test", category_id: "cat-1" },
            },
          ],
        },
      ],
      staleItems: [],
    } as any);
    await service.initiateCheckout({
      userId: "user-1",
      shippingAddress: { city: "Dubai" },
      channel: "web",
    });
    expect(mockCouponService.validate).toHaveBeenCalled();
    expect(capturedCreateOrderArgs.discountTotal).toBe(1000);
    expect(capturedCreateOrderArgs.couponId).toBe("c1");
    expect(capturedCreateOrderArgs.couponCode).toBe("SAVE10");
    expect(capturedCreateOrderArgs.couponDiscount).toBe(1000);
    // The refreshed discount is written back to the cart
    expect(mockCartService.setCoupon).toHaveBeenCalledWith("user-1", null, {
      couponId: "c1",
      code: "SAVE10",
      discount: 1000,
    });
  });

  it("initiateCheckout clears an invalid cart coupon and rejects with a clear error", async () => {
    const { BadRequestError } = await import("@materialhub/plugins");
    mockCartService.getCart.mockResolvedValue({
      cart: {
        id: "cart-1",
        subtotal: 10000,
        item_count: 2,
        coupon_id: "c1",
        coupon_code: "SAVE10",
        coupon_discount: 1000,
      },
      items: [
        {
          vendor_id: "v1",
          items: [
            {
              id: "ci-1",
              vendor_id: "v1",
              product_id: "p1",
              variant_id: "v1",
              quantity: 2,
              unit_price: 5000,
              line_total: 10000,
              product: { name: "Test", category_id: "cat-1" },
            },
          ],
        },
      ],
      staleItems: [],
    } as any);
    mockCouponService.validate.mockRejectedValueOnce(new BadRequestError("Coupon has expired"));
    await expect(
      service.initiateCheckout({
        userId: "user-1",
        shippingAddress: { city: "Dubai" },
        channel: "web",
      }),
    ).rejects.toThrow(/no longer valid/i);
    expect(mockCartService.clearCoupon).toHaveBeenCalledWith("user-1", null);
    expect(mockOrderCreationService.createOrder).not.toHaveBeenCalled();
  });

  it("createPaymentIntent: records coupon usage for cash_on_delivery", async () => {
    await service.createPaymentIntent("order-1", "user-cod", 12000, "cash_on_delivery");
    expect(mockOrderConfirmation.recordCouponUsage).toHaveBeenCalledWith("order-1");
  });

  it("createPaymentIntent: does NOT record coupon usage for Stripe (webhook owns that)", async () => {
    await service.createPaymentIntent("order-1", "user-stripe", 12000, "credit_card");
    expect(mockOrderConfirmation.recordCouponUsage).not.toHaveBeenCalled();
  });

  it("rejects checkout when cart has stale prices", async () => {
    mockCartService.getCart.mockResolvedValueOnce({
      cart: { id: "cart-1", subtotal: 10000, item_count: 1 },
      items: [
        {
          vendor_id: "v1",
          items: [
            {
              product_id: "p1",
              variant_id: "v1",
              quantity: 1,
              unit_price: 5000,
              line_total: 5000,
              product: { name: "Test", category_id: "cat-1" },
            },
          ],
        },
      ],
      staleItems: ["item-1"] as string[],
    });
    await expect(
      service.initiateCheckout({ userId: "user-1", shippingAddress: {}, channel: "web" }),
    ).rejects.toThrow("stale");
  });
});
