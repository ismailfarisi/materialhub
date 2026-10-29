import { beforeEach, describe, expect, it, mock } from "bun:test";
import { QuoteService } from "./quote.service.ts";

const makeMocks = () => {
  const cartService = {
    getCart: mock(() =>
      Promise.resolve({
        cart: { id: "c1", subtotal: 80000, coupon_discount: 0 },
        items: [
          {
            vendor_id: "v_a",
            items: [
              {
                id: "i1",
                vendor_id: "v_a",
                product_id: "p1",
                variant_id: null,
                quantity: 1,
                unit_price: 15000,
              },
              {
                id: "i2",
                vendor_id: "v_a",
                product_id: "p2",
                variant_id: null,
                quantity: 1,
                unit_price: 20000,
              },
            ],
          },
          {
            vendor_id: "v_b",
            items: [
              {
                id: "i3",
                vendor_id: "v_b",
                product_id: "p3",
                variant_id: null,
                quantity: 1,
                unit_price: 45000,
              },
            ],
          },
        ],
        staleItems: [],
      }),
    ),
  };
  const taxService = {
    getRate: mock(() => Promise.resolve(5)),
    calculateTax: mock((amt: number, r: number) => Math.round((amt * r) / 100)),
  };
  const rulesEpochService = { get: mock(() => Promise.resolve(7)) };
  const thresholdRepo = {
    find: mock(() =>
      Promise.resolve([
        {
          provider: "tabby",
          min_amount_fils: 10000,
          max_amount_fils: 500000,
          plans: [{ installments: 4, interval_days: 30 }],
        },
        {
          provider: "tamara",
          min_amount_fils: 5000,
          max_amount_fils: 300000,
          plans: [{ installments: 3, interval_days: 30 }],
        },
        {
          provider: "cod",
          min_amount_fils: 0,
          max_amount_fils: 500000,
          plans: [],
          is_active: true,
          surcharge_fils: 1000,
        },
      ]),
    ),
  };

  const rates = [
    {
      id: "r1",
      vendor_id: "v_a",
      zone_id: "z1",
      method: "standard",
      base_cost: 0,
      per_kg_cost: 0,
      free_above: 20000,
      estimated_days_min: 3,
      estimated_days_max: 5,
      deleted_at: null,
      is_active: true,
    },
    {
      id: "r2",
      vendor_id: "v_a",
      zone_id: "z1",
      method: "express",
      base_cost: 2500,
      per_kg_cost: 0,
      free_above: null,
      estimated_days_min: 1,
      estimated_days_max: 2,
      deleted_at: null,
      is_active: true,
    },
    {
      id: "r3",
      vendor_id: "v_a",
      zone_id: "z1",
      method: "same_day",
      base_cost: 5000,
      per_kg_cost: 0,
      free_above: null,
      estimated_days_min: 0,
      estimated_days_max: 0,
      deleted_at: null,
      is_active: true,
    },
    {
      id: "r4",
      vendor_id: "v_b",
      zone_id: "z1",
      method: "standard",
      base_cost: 0,
      per_kg_cost: 0,
      free_above: null,
      estimated_days_min: 3,
      estimated_days_max: 5,
      deleted_at: null,
      is_active: true,
    },
    {
      id: "r5",
      vendor_id: "v_b",
      zone_id: "z1",
      method: "express",
      base_cost: 3000,
      per_kg_cost: 0,
      free_above: null,
      estimated_days_min: 1,
      estimated_days_max: 2,
      deleted_at: null,
      is_active: true,
    },
  ];
  const makeQB = (rows: any[]) => ({
    where() {
      return this;
    },
    andWhere() {
      return this;
    },
    getMany: () => Promise.resolve(rows),
  });
  const shippingRateRepo = { createQueryBuilder: mock(() => makeQB(rates)) };
  const userAddressRepo = {
    findOne: mock(() => Promise.resolve({ id: "a1", user_id: "u1", area_id: "z1" })),
  };
  const siteSettingRepo = {
    findOne: mock((_args?: any): Promise<any> => Promise.resolve(null)),
  };

  return {
    cartService,
    taxService,
    rulesEpochService,
    thresholdRepo,
    shippingRateRepo,
    userAddressRepo,
    siteSettingRepo,
  };
};

describe("QuoteService — §12 worked example + edge cases", () => {
  let svc: QuoteService;
  let mocks: ReturnType<typeof makeMocks>;

  beforeEach(() => {
    mocks = makeMocks();
    svc = new QuoteService(
      mocks.cartService as any,
      mocks.taxService as any,
      mocks.rulesEpochService as any,
      mocks.thresholdRepo as any,
      mocks.shippingRateRepo as any,
      mocks.userAddressRepo as any,
      mocks.siteSettingRepo as any,
      "test-secret",
    );
  });

  it("returns schema_version 1, valid token, and 2 delivery groups", async () => {
    const { response } = await svc.buildQuote({ userId: "u1", addressId: "a1" });
    expect(response.schema_version).toBe(1);
    expect(response.quote_token.startsWith("q_")).toBe(true);
    expect(response.shipping?.groups.length).toBe(2);
  });

  it("totals match §12 (VAT-inclusive): 80000 gross subtotal, 3810 extracted VAT, 500 bps, card default", async () => {
    const { response } = await svc.buildQuote({ userId: "u1", addressId: "a1" });
    // subtotal_fils is gross-incl-VAT (80000). The embedded VAT is
    // extracted as 80000 - round(80000 / 1.05) = 80000 - 76190 = 3810.
    // vat_fils is informational only and is NOT added to grand_total.
    expect(response.totals.subtotal_fils).toBe(80000);
    expect(response.totals.vat_fils).toBe(3810);
    expect(response.totals.vat_rate_bps).toBe(500);
    expect(response.totals.default_selection.payment_method_id).toBe("card");
  });

  it("COD unavailable when subtotal > threshold (uses 550000)", async () => {
    mocks.cartService.getCart.mockResolvedValueOnce({
      cart: { id: "c1", subtotal: 550000, coupon_discount: 0 },
      items: [
        {
          vendor_id: "v_a",
          items: [
            {
              id: "i1",
              vendor_id: "v_a",
              product_id: "p1",
              variant_id: null,
              quantity: 1,
              unit_price: 550000,
            },
          ],
        },
      ],
      staleItems: [],
    } as any);
    const { response } = await svc.buildQuote({ userId: "u1", addressId: "a1" });
    const cod = response.payment_methods.find((p) => p.id === "cod");
    expect(cod?.available).toBe(false);
    expect(cod?.reason_key).toBe("payment.cod.over_threshold");
  });

  it("partial quote (no address) has requires_address: true and shipping null", async () => {
    const { response } = await svc.buildQuote({ userId: "u1", addressId: null });
    expect(response.requires_address).toBe(true);
    expect(response.shipping).toBeNull();
  });

  it("validates a token it just issued; rejects mutated cart_hash", async () => {
    const { response, cartHash, rulesEpoch } = await svc.buildQuote({
      userId: "u1",
      addressId: "a1",
    });
    const ok = await svc.validateQuoteToken({
      token: response.quote_token,
      userId: "u1",
      addressId: "a1",
      cartHash,
      rulesEpoch,
      fxCapturedAt: response.fx_snapshot.captured_at,
    });
    expect(ok).toBe(true);
    const bad = await svc.validateQuoteToken({
      token: response.quote_token,
      userId: "u1",
      addressId: "a1",
      cartHash: "mutated",
      rulesEpoch,
      fxCapturedAt: response.fx_snapshot.captured_at,
    });
    expect(bad).toBe(false);
  });

  it("E1: BNPL out-of-range still leaves card available (no blocking_error)", async () => {
    mocks.cartService.getCart.mockResolvedValueOnce({
      cart: { id: "c1", subtotal: 10_000_000, coupon_discount: 0 },
      items: [
        {
          vendor_id: "v_a",
          items: [
            {
              id: "i1",
              vendor_id: "v_a",
              product_id: "p1",
              variant_id: null,
              quantity: 1,
              unit_price: 10_000_000,
            },
          ],
        },
      ],
      staleItems: [],
    } as any);
    const { response } = await svc.buildQuote({ userId: "u1", addressId: "a1" });
    expect(response.payment_methods.find((p) => p.id === "cod")?.available).toBe(false);
    expect(response.payment_methods.find((p) => p.id === "tabby")?.available).toBe(false);
    expect(response.payment_methods.find((p) => p.id === "tamara")?.available).toBe(false);
    expect(response.payment_methods.find((p) => p.id === "card")?.available).toBe(true);
    expect(response.blocking_error).toBeUndefined();
  });

  it("sums the cheapest rate-based method per delivery group across vendors", async () => {
    // Two vendors, each with a single (non-free) standard rate in zone z1.
    // shipping_fils must be the sum of the cheapest method per group, not a
    // single platform flat fee.
    const rateRows = [
      {
        id: "r_a",
        vendor_id: "v_a",
        zone_id: "z1",
        method: "standard",
        base_cost: 1500,
        per_kg_cost: 0,
        free_above: null,
        estimated_days_min: 3,
        estimated_days_max: 5,
        deleted_at: null,
        is_active: true,
      },
      {
        id: "r_b",
        vendor_id: "v_b",
        zone_id: "z1",
        method: "standard",
        base_cost: 2000,
        per_kg_cost: 0,
        free_above: null,
        estimated_days_min: 3,
        estimated_days_max: 5,
        deleted_at: null,
        is_active: true,
      },
    ];
    const makeQB = (rows: any[]) => ({
      where() {
        return this;
      },
      andWhere() {
        return this;
      },
      getMany: () => Promise.resolve(rows),
    });
    mocks.shippingRateRepo.createQueryBuilder.mockReturnValueOnce(makeQB(rateRows) as any);
    const { response } = await svc.buildQuote({ userId: "u1", addressId: "a1" });
    // Both vendors expose the same method-set {standard}, so they bucket into a
    // single delivery group whose standard price sums across vendors:
    // 1500 (v_a) + 2000 (v_b) = 3500.
    expect(response.totals.shipping_fils).toBe(3500);
    expect(response.shipping?.groups.length).toBe(1);
    expect(response.shipping?.groups[0]?.methods[0]?.price_fils).toBe(3500);
  });

  it("a rate's free_above makes that method free and is exposed as free_threshold_fils", async () => {
    // Single vendor, one standard rate base_cost=1500 free_above=15000.
    // Subtotal 80000 (>= free_above) → method price 0, total 0, threshold exposed.
    mocks.cartService.getCart.mockResolvedValueOnce({
      cart: { id: "c1", subtotal: 80000, coupon_discount: 0 },
      items: [
        {
          vendor_id: "v_a",
          items: [
            {
              id: "i1",
              vendor_id: "v_a",
              product_id: "p1",
              variant_id: null,
              quantity: 1,
              unit_price: 80000,
            },
          ],
        },
      ],
      staleItems: [],
    } as any);
    const rateRows = [
      {
        id: "r_a",
        vendor_id: "v_a",
        zone_id: "z1",
        method: "standard",
        base_cost: 1500,
        per_kg_cost: 0,
        free_above: 15000,
        estimated_days_min: 3,
        estimated_days_max: 5,
        deleted_at: null,
        is_active: true,
      },
    ];
    const makeQB = (rows: any[]) => ({
      where() {
        return this;
      },
      andWhere() {
        return this;
      },
      getMany: () => Promise.resolve(rows),
    });
    mocks.shippingRateRepo.createQueryBuilder.mockReturnValueOnce(makeQB(rateRows) as any);
    const { response } = await svc.buildQuote({ userId: "u1", addressId: "a1" });
    expect(response.totals.shipping_fils).toBe(0);
    for (const g of response.shipping?.groups ?? []) {
      for (const m of g.methods) {
        expect(m.price_fils).toBe(0);
        expect(m.free_threshold_fils).toBe(15000);
      }
    }
  });

  it("charges shipping from shipping_rates base_cost and exposes real per-group price_fils", async () => {
    // One vendor, address present, zone null. One active platform-default
    // standard rate: base_cost=1500, free_above=15000. Subtotal 9000 (< free_above).
    mocks.cartService.getCart.mockResolvedValueOnce({
      cart: { id: "c1", subtotal: 9000, coupon_discount: 0 },
      items: [
        {
          vendor_id: "v_a",
          items: [
            {
              id: "i1",
              vendor_id: "v_a",
              product_id: "p1",
              variant_id: null,
              quantity: 1,
              unit_price: 9000,
            },
          ],
        },
      ],
      staleItems: [],
    } as any);
    // No payment thresholds → only card is available (no surcharge).
    mocks.thresholdRepo.find.mockResolvedValueOnce([] as any);
    // Address resolves to a null zone.
    mocks.userAddressRepo.findOne.mockResolvedValueOnce({
      id: "a1",
      user_id: "u1",
      area_id: null,
    } as any);
    const rateRows = [
      {
        id: "rdef",
        vendor_id: null,
        zone_id: null,
        method: "standard",
        base_cost: 1500,
        per_kg_cost: 0,
        free_above: 15000,
        estimated_days_min: 5,
        estimated_days_max: 7,
        deleted_at: null,
        is_active: true,
      },
    ];
    const makeQB = (rows: any[]) => ({
      where() {
        return this;
      },
      andWhere() {
        return this;
      },
      getMany: () => Promise.resolve(rows),
    });
    mocks.shippingRateRepo.createQueryBuilder.mockReturnValueOnce(makeQB(rateRows) as any);

    const { response } = await svc.buildQuote({ userId: "u1", addressId: "a1" });

    expect(response.totals.shipping_fils).toBe(1500);
    expect(response.shipping?.groups[0]?.methods[0]?.price_fils).toBe(1500);
    expect(response.totals.default_selection.payment_method_id).toBe("card");
    expect(response.totals.grand_total_fils).toBe(9000 + 1500);
  });

  it("E8: address without area_id → zoneId null, uses platform-default rates", async () => {
    mocks.userAddressRepo.findOne.mockResolvedValueOnce({
      id: "a1",
      user_id: "u1",
      area_id: null,
    } as any);
    const defaultRates = [
      {
        id: "rdef",
        vendor_id: null,
        zone_id: null,
        method: "standard",
        base_cost: 1000,
        per_kg_cost: 0,
        free_above: null,
        estimated_days_min: 5,
        estimated_days_max: 7,
        deleted_at: null,
        is_active: true,
      },
    ];
    const makeQB = (rows: any[]) => ({
      where() {
        return this;
      },
      andWhere() {
        return this;
      },
      getMany: () => Promise.resolve(rows),
    });
    mocks.shippingRateRepo.createQueryBuilder.mockReturnValueOnce(makeQB(defaultRates) as any);
    const { response } = await svc.buildQuote({ userId: "u1", addressId: "a1" });
    expect(response.shipping?.groups.length).toBeGreaterThan(0);
    expect(response.shipping?.groups[0]?.methods[0]?.id).toBe("standard");
  });
});

describe("QuoteService — coupon totals", () => {
  const couponCart = (couponFields: any = {}, rates?: any[]) => {
    const mocks = makeMocks();
    mocks.cartService.getCart.mockImplementation(() =>
      Promise.resolve({
        cart: {
          id: "c1",
          subtotal: 80000,
          coupon_id: "cp1",
          coupon_code: "SAVE",
          coupon_discount: 0,
          ...couponFields,
        },
        items: [
          {
            vendor_id: "v_a",
            items: [
              {
                id: "i1",
                vendor_id: "v_a",
                product_id: "p1",
                variant_id: null,
                quantity: 1,
                unit_price: 35000,
              },
            ],
          },
          {
            vendor_id: "v_b",
            items: [
              {
                id: "i3",
                vendor_id: "v_b",
                product_id: "p3",
                variant_id: null,
                quantity: 1,
                unit_price: 45000,
              },
            ],
          },
        ],
        staleItems: [],
      } as any),
    );
    if (rates) {
      mocks.shippingRateRepo.createQueryBuilder.mockImplementation(
        () =>
          ({
            where() {
              return this;
            },
            andWhere() {
              return this;
            },
            getMany: () => Promise.resolve(rates),
          }) as any,
      );
    }
    return mocks;
  };

  const paidRates = [
    {
      id: "r1",
      vendor_id: "v_a",
      zone_id: "z1",
      method: "standard",
      base_cost: 1000,
      per_kg_cost: 0,
      free_above: null,
      estimated_days_min: 3,
      estimated_days_max: 5,
      deleted_at: null,
      is_active: true,
    },
    {
      id: "r4",
      vendor_id: "v_b",
      zone_id: "z1",
      method: "standard",
      base_cost: 2000,
      per_kg_cost: 0,
      free_above: null,
      estimated_days_min: 3,
      estimated_days_max: 5,
      deleted_at: null,
      is_active: true,
    },
  ];

  const makeSvc = (mocks: ReturnType<typeof makeMocks>, couponService: any) =>
    new QuoteService(
      mocks.cartService as any,
      mocks.taxService as any,
      mocks.rulesEpochService as any,
      mocks.thresholdRepo as any,
      mocks.shippingRateRepo as any,
      mocks.userAddressRepo as any,
      mocks.siteSettingRepo as any,
      "test-secret",
      couponService,
    );

  it("subtracts a re-validated coupon discount from grand_total", async () => {
    const mocks = couponCart();
    const couponService = {
      validate: mock(() =>
        Promise.resolve({
          couponId: "cp1",
          code: "SAVE",
          type: "percentage",
          discount: 8000,
          vendorId: null,
        }),
      ),
    };
    const svc = makeSvc(mocks, couponService);
    const { response } = await svc.buildQuote({ userId: "u1", addressId: "a1" });
    expect(couponService.validate).toHaveBeenCalledWith("SAVE", "u1", [
      { product_id: "p1", vendor_id: "v_a", quantity: 1, line_total: 35000 },
      { product_id: "p3", vendor_id: "v_b", quantity: 1, line_total: 45000 },
    ]);
    expect(response.totals.discount_fils).toBe(8000);
    // 80000 subtotal + 0 shipping (free rates) + 0 surcharge - 8000
    expect(response.totals.grand_total_fils).toBe(72000);
  });

  it("shows no discount when the cart coupon no longer validates", async () => {
    const mocks = couponCart({ coupon_discount: 5000 });
    const couponService = {
      validate: mock(() => Promise.reject(new Error("Coupon has expired"))),
    };
    const svc = makeSvc(mocks, couponService);
    const { response } = await svc.buildQuote({ userId: "u1", addressId: "a1" });
    expect(response.totals.discount_fils).toBe(0);
    expect(response.totals.grand_total_fils).toBe(80000);
  });

  it("waives only the covered vendor group's shipping for a vendor free_shipping coupon", async () => {
    const mocks = couponCart({}, paidRates);
    const couponService = {
      validate: mock(() =>
        Promise.resolve({
          couponId: "cp1",
          code: "SAVE",
          type: "free_shipping",
          discount: 0,
          vendorId: "v_a",
        }),
      ),
    };
    const svc = makeSvc(mocks, couponService);
    const { response } = await svc.buildQuote({ userId: "u1", addressId: "a1" });
    // v_a's 1000 is waived; v_b's 2000 still charged
    expect(response.totals.shipping_fils).toBe(2000);
    expect(response.totals.grand_total_fils).toBe(82000);
  });

  it("waives all shipping for a platform-wide free_shipping coupon", async () => {
    const mocks = couponCart({}, paidRates);
    const couponService = {
      validate: mock(() =>
        Promise.resolve({
          couponId: "cp1",
          code: "SAVE",
          type: "free_shipping",
          discount: 0,
          vendorId: null,
        }),
      ),
    };
    const svc = makeSvc(mocks, couponService);
    const { response } = await svc.buildQuote({ userId: "u1", addressId: "a1" });
    expect(response.totals.shipping_fils).toBe(0);
    expect(response.totals.grand_total_fils).toBe(80000);
  });

  it("emits a different ETag when a coupon is applied vs removed (same items)", async () => {
    const couponService = {
      validate: mock(() =>
        Promise.resolve({
          couponId: "cp1",
          code: "SAVE",
          type: "percentage",
          discount: 8000,
          vendorId: null,
        }),
      ),
    };
    const withCoupon = makeSvc(couponCart(), couponService);
    const { etag: etagApplied } = await withCoupon.buildQuote({ userId: "u1", addressId: "a1" });

    // Same cart, coupon removed (cleared from the cart row)
    const withoutCoupon = makeSvc(
      couponCart({ coupon_id: null, coupon_code: null }),
      couponService,
    );
    const { etag: etagRemoved } = await withoutCoupon.buildQuote({ userId: "u1", addressId: "a1" });

    // Items are identical — only the coupon differs. If these match, any
    // revalidating cache serves a 304 that replays the stale coupon state.
    expect(etagApplied).not.toBe(etagRemoved);
  });
});
