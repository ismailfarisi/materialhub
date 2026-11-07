import { describe, expect, test } from "bun:test";
import { PromotionsService, couponOwnerName } from "./promotions.service.ts";

const base = {
  type: "percentage",
  discount_value: 10,
  is_active: true,
  starts_at: null,
  expires_at: null,
  usage_count: 0,
  usage_limit: null,
  created_at: "2026-11-01T00:00:00.000Z",
};

describe("promotions overview", () => {
  test("vendor coupons carry the vendor's name; platform coupons have none", async () => {
    const service = new PromotionsService({
      list: async () => ({
        items: [
          {
            ...base,
            id: "c1",
            name: "Kraft week",
            code: "KRAFT10",
            vendor_id: "v1",
            vendor: { name: "Gulf Board Supply", business_name: "Gulf Board Supply LLC" },
          },
          { ...base, id: "c2", name: "Welcome", code: "HELLO", vendor_id: null, vendor: null },
        ],
        total: 2,
        page: 1,
        limit: 1000,
      }),
    } as any);
    const { items } = await service.getOverview({});
    expect(items.find((i) => i.id === "c1")?.vendor_name).toBe("Gulf Board Supply");
    expect(items.find((i) => i.id === "c2")?.vendor_name).toBeNull();
  });

  test("a vendor coupon whose vendor didn't load is still not 'Platform'", () => {
    expect(couponOwnerName({ vendor_id: "v1", vendor: null })).toBe("Vendor");
  });
});
