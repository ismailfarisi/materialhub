// coupon.service.test.ts
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { type CouponCartLine, CouponService } from "./coupon.service.ts";

function line(over: Partial<CouponCartLine> = {}): CouponCartLine {
  return {
    product_id: "prod-1",
    vendor_id: "vendor-1",
    quantity: 1,
    line_total: 10000,
    ...over,
  };
}

describe("CouponService", () => {
  const mockCouponRepo = {
    findOne: mock((_args?: any): Promise<any> => Promise.resolve(null)),
    increment: mock(() => Promise.resolve()),
  };
  const mockUsageRepo = {
    count: mock(() => Promise.resolve(0)),
    save: mock((u: any) => Promise.resolve(u)),
  };
  const mockOrderRepo = {
    count: mock(() => Promise.resolve(0)),
  };

  let service: CouponService;

  beforeEach(() => {
    Object.values(mockCouponRepo).forEach((m) => m.mockClear());
    Object.values(mockUsageRepo).forEach((m) => m.mockClear());
    Object.values(mockOrderRepo).forEach((m) => m.mockClear());
    service = new CouponService(mockCouponRepo as any, mockUsageRepo as any, mockOrderRepo as any);
  });

  it("rejects expired coupon", async () => {
    mockCouponRepo.findOne.mockResolvedValueOnce({
      id: "c1",
      code: "SAVE10",
      type: "percentage",
      discount_value: 10,
      is_active: true,
      expires_at: new Date("2025-01-01"),
      usage_count: 0,
      usage_limit: 100,
      usage_limit_per_user: null,
    });
    await expect(service.validate("SAVE10", "user-1", [line()])).rejects.toThrow("expired");
  });

  it("rejects when usage limit reached", async () => {
    mockCouponRepo.findOne.mockResolvedValueOnce({
      id: "c1",
      code: "SAVE10",
      type: "percentage",
      discount_value: 10,
      is_active: true,
      expires_at: null,
      usage_count: 100,
      usage_limit: 100,
      usage_limit_per_user: null,
    });
    await expect(service.validate("SAVE10", "user-1", [line()])).rejects.toThrow("limit");
  });

  it("rejects a single-use coupon that has already been redeemed", async () => {
    mockCouponRepo.findOne.mockResolvedValueOnce({
      id: "c1",
      code: "ONCE",
      type: "percentage",
      discount_value: 10,
      is_active: true,
      expires_at: null,
      usage_count: 1,
      usage_limit: null,
      usage_limit_per_user: null,
      is_single_use: true,
    });
    await expect(service.validate("ONCE", "user-1", [line()])).rejects.toThrow("limit");
  });

  it("rejects when user exceeded per-user limit", async () => {
    mockCouponRepo.findOne.mockResolvedValueOnce({
      id: "c1",
      code: "SAVE10",
      type: "percentage",
      discount_value: 10,
      is_active: true,
      expires_at: null,
      usage_count: 5,
      usage_limit: null,
      usage_limit_per_user: 1,
    });
    mockUsageRepo.count.mockResolvedValueOnce(1);
    await expect(service.validate("SAVE10", "user-1", [line()])).rejects.toThrow("already used");
  });

  it("rejects when below minimum order amount", async () => {
    mockCouponRepo.findOne.mockResolvedValueOnce({
      id: "c1",
      code: "SAVE10",
      type: "percentage",
      discount_value: 10,
      is_active: true,
      expires_at: null,
      usage_count: 0,
      usage_limit: null,
      usage_limit_per_user: null,
      minimum_order_amount: 20000,
    });
    await expect(service.validate("SAVE10", "user-1", [line()])).rejects.toThrow("minimum");
  });

  it("normalizes the code to uppercase before lookup", async () => {
    mockCouponRepo.findOne.mockResolvedValueOnce({
      id: "c1",
      code: "SAVE10",
      type: "percentage",
      discount_value: 10,
      is_active: true,
      expires_at: null,
      usage_count: 0,
      usage_limit: null,
      usage_limit_per_user: null,
      minimum_order_amount: null,
      max_discount_amount: null,
      first_order_only: false,
      new_users_only: false,
    });
    await service.validate(" save10 ", "user-1", [line()]);
    expect(mockCouponRepo.findOne.mock.calls[0]?.[0]?.where?.code).toBe("SAVE10");
  });

  it("calculates percentage discount with max cap", async () => {
    mockCouponRepo.findOne.mockResolvedValueOnce({
      id: "c1",
      code: "SAVE10",
      type: "percentage",
      discount_value: 10,
      is_active: true,
      expires_at: null,
      usage_count: 0,
      usage_limit: null,
      usage_limit_per_user: null,
      minimum_order_amount: null,
      max_discount_amount: 500,
      first_order_only: false,
      new_users_only: false,
    });
    const result = await service.validate("SAVE10", "user-1", [line()]);
    // 10% of 10000 = 1000, but max is 500
    expect(result.discount).toBe(500);
  });

  it("calculates fixed_amount discount", async () => {
    mockCouponRepo.findOne.mockResolvedValueOnce({
      id: "c1",
      code: "FLAT500",
      type: "fixed_amount",
      discount_value: 500,
      is_active: true,
      expires_at: null,
      usage_count: 0,
      usage_limit: null,
      usage_limit_per_user: null,
      minimum_order_amount: null,
      max_discount_amount: null,
      first_order_only: false,
      new_users_only: false,
    });
    const result = await service.validate("FLAT500", "user-1", [line()]);
    expect(result.discount).toBe(500);
  });

  it("rejects first_order_only when user has orders", async () => {
    mockCouponRepo.findOne.mockResolvedValueOnce({
      id: "c1",
      code: "WELCOME",
      type: "percentage",
      discount_value: 20,
      is_active: true,
      expires_at: null,
      usage_count: 0,
      usage_limit: null,
      usage_limit_per_user: null,
      minimum_order_amount: null,
      max_discount_amount: null,
      first_order_only: true,
      new_users_only: false,
    });
    mockOrderRepo.count.mockResolvedValueOnce(3);
    await expect(service.validate("WELCOME", "user-1", [line()])).rejects.toThrow("first order");
  });
});

function makeCoupon(over: any = {}) {
  return {
    id: "c1",
    code: "SAVE",
    type: "percentage",
    discount_value: 10,
    applicable_to: "all",
    collection_id: null,
    vendor_id: null,
    is_active: true,
    expires_at: null,
    starts_at: null,
    usage_count: 0,
    usage_limit: null,
    usage_limit_per_user: null,
    minimum_order_amount: null,
    max_discount_amount: null,
    first_order_only: false,
    new_users_only: false,
    minimum_quantity: null,
    is_single_use: false,
    couponUserRestrictions: [],
    couponExcludedProducts: [],
    couponProducts: [],
    couponVendors: [],
    ...over,
  };
}

function makeService(coupon: any, memberRows: any[] = []) {
  return new CouponService(
    { findOne: async () => coupon } as any,
    { count: async () => 0 } as any,
    { count: async () => 0 } as any,
    undefined,
    { find: async () => memberRows } as any,
  );
}

describe("CouponService vendor scoping", () => {
  const cart: CouponCartLine[] = [
    line({ product_id: "p1", vendor_id: "vendor-A", quantity: 2, line_total: 20000 }),
    line({ product_id: "p2", vendor_id: "vendor-B", quantity: 1, line_total: 30000 }),
  ];

  it("discounts only the coupon vendor's items", async () => {
    const svc = makeService(
      makeCoupon({ vendor_id: "vendor-A", applicable_to: "specific_products" }),
    );
    const r = await svc.validate("SAVE", "u1", cart);
    // 10% of vendor-A's 20000, NOT of the 50000 cart
    expect(r.discount).toBe(2000);
    expect(r.vendorId).toBe("vendor-A");
  });

  it("rejects a vendor coupon when the cart has none of that vendor's items", async () => {
    const svc = makeService(
      makeCoupon({ vendor_id: "vendor-C", applicable_to: "specific_products" }),
    );
    await expect(svc.validate("SAVE", "u1", cart)).rejects.toThrow(/does not apply/i);
  });

  it("vendor coupon with a product list only covers those products", async () => {
    const svc = makeService(
      makeCoupon({
        vendor_id: "vendor-A",
        applicable_to: "specific_products",
        couponProducts: [{ product_id: "p-other" }],
      }),
    );
    await expect(svc.validate("SAVE", "u1", cart)).rejects.toThrow(/does not apply/i);
  });

  it("fixed_amount is capped at the qualifying subtotal", async () => {
    const svc = makeService(
      makeCoupon({
        vendor_id: "vendor-A",
        applicable_to: "specific_products",
        type: "fixed_amount",
        discount_value: 50000,
      }),
    );
    const r = await svc.validate("SAVE", "u1", cart);
    expect(r.discount).toBe(20000); // vendor-A subtotal, not the 50000 face value
  });

  it("minimum_quantity counts units of qualifying items", async () => {
    const svc = makeService(
      makeCoupon({
        vendor_id: "vendor-A",
        applicable_to: "specific_products",
        minimum_quantity: 3,
      }),
    );
    // vendor-A has 2 units in cart (vendor-B's unit must not count)
    await expect(svc.validate("SAVE", "u1", cart)).rejects.toThrow(/minimum of 3/i);
  });

  it("platform-wide percentage still discounts the whole cart", async () => {
    const svc = makeService(makeCoupon());
    const r = await svc.validate("SAVE", "u1", cart);
    expect(r.discount).toBe(5000); // 10% of 50000
    expect(r.vendorId).toBeNull();
  });

  it("excluded products are removed from the discount base", async () => {
    const svc = makeService(makeCoupon({ couponExcludedProducts: [{ product_id: "p2" }] }));
    const r = await svc.validate("SAVE", "u1", cart);
    expect(r.discount).toBe(2000); // 10% of p1's 20000 only
  });

  it("rejects when the cart is empty", async () => {
    const svc = makeService(makeCoupon());
    await expect(svc.validate("SAVE", "u1", [])).rejects.toThrow(/empty/i);
  });
});

describe("CouponService specific_collection", () => {
  const collCoupon = (over: any = {}) =>
    makeCoupon({ applicable_to: "specific_collection", collection_id: "col1", ...over });

  it("rejects when no cart item is a collection member", async () => {
    const svc = makeService(collCoupon(), []);
    await expect(svc.validate("SAVE", "u1", [line({ product_id: "prodX" })])).rejects.toThrow(
      /does not apply/i,
    );
  });

  it("passes when a cart item is a collection member", async () => {
    const svc = makeService(collCoupon(), [{ product_id: "prodX" }]);
    const r = await svc.validate("SAVE", "u1", [line({ product_id: "prodX", line_total: 5000 })]);
    expect(r.discount).toBe(500);
  });

  it("rejects when the only member item is excluded by the coupon", async () => {
    const svc = makeService(collCoupon({ couponExcludedProducts: [{ product_id: "prodX" }] }), [
      { product_id: "prodX" },
    ]);
    await expect(svc.validate("SAVE", "u1", [line({ product_id: "prodX" })])).rejects.toThrow(
      /does not apply/i,
    );
  });

  it("discounts only the member items' subtotal", async () => {
    const svc = makeService(collCoupon(), [{ product_id: "prodX" }]);
    const r = await svc.validate("SAVE", "u1", [
      line({ product_id: "prodX", line_total: 5000 }),
      line({ product_id: "prodY", line_total: 95000 }),
    ]);
    expect(r.discount).toBe(500); // 10% of 5000, not of 100000
  });
});

describe("CouponService min-order message", () => {
  it("formats the minimum order amount in AED, not fils", async () => {
    const svc = makeService(makeCoupon({ minimum_order_amount: 10000 }));
    await expect(svc.validate("SAVE", "u1", [line({ line_total: 5000 })])).rejects.toThrow(
      "AED 100.00",
    );
  });
});

describe("CouponService.discoverApplicable", () => {
  const cart: CouponCartLine[] = [
    line({ product_id: "p1", vendor_id: "vendor-A", quantity: 1, line_total: 20000 }),
  ];

  function makeDiscoverService(candidates: any[]) {
    const repo = {
      find: async () => candidates,
      findOne: async (args: any) => candidates.find((c) => c.code === args?.where?.code) ?? null,
    };
    return new CouponService(
      repo as any,
      { count: async () => 0 } as any,
      { count: async () => 0 } as any,
      undefined,
      { find: async () => [] } as any,
    );
  }

  it("returns only coupons that validate against the cart, with discount previews", async () => {
    const svc = makeDiscoverService([
      makeCoupon({ id: "c1", code: "TEN" }), // 10% of 20000 = 2000
      makeCoupon({ id: "c2", code: "OTHERVENDOR", vendor_id: "vendor-Z" }), // no qualifying items
      makeCoupon({ id: "c3", code: "BIGMIN", minimum_order_amount: 99999 }), // min not met
    ]);
    const out = await svc.discoverApplicable("u1", cart);
    expect(out.map((c) => c.code)).toEqual(["TEN"]);
    expect(out[0]!.discount).toBe(2000);
  });

  it("skips scheduled and expired candidates without validating them", async () => {
    const svc = makeDiscoverService([
      makeCoupon({ id: "c1", code: "FUTURE", starts_at: new Date(Date.now() + 86400000) }),
      makeCoupon({ id: "c2", code: "PAST", expires_at: new Date(Date.now() - 86400000) }),
      makeCoupon({ id: "c3", code: "NOW" }),
    ]);
    const out = await svc.discoverApplicable("u1", cart);
    expect(out.map((c) => c.code)).toEqual(["NOW"]);
  });

  it("returns [] for an empty cart", async () => {
    const svc = makeDiscoverService([makeCoupon()]);
    expect(await svc.discoverApplicable("u1", [])).toEqual([]);
  });
});
