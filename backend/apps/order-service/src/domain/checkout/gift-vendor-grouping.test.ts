import { describe, expect, test } from "bun:test";
import { groupItemsForVendorOrders } from "./order-creation.service.ts";

describe("groupItemsForVendorOrders", () => {
  test("normal items group by vendor", () => {
    const g = groupItemsForVendorOrders([
      { vendor_id: "v1", product_id: "p1" },
      { vendor_id: "v1", product_id: "p2" },
      { vendor_id: "v2", product_id: "p3" },
    ]);
    expect(g).toHaveLength(2);
    expect(g.find((b) => b.vendorId === "v1")!.items).toHaveLength(2);
  });
  test("gift components split into their own bucket per (vendor, box), away from normal items", () => {
    const g = groupItemsForVendorOrders([
      { vendor_id: "v1", product_id: "p1" },
      { vendor_id: "v1", product_id: "p2", __giftBoxRef: "boxA" },
      { vendor_id: "v1", product_id: "p3", __giftBoxRef: "boxB" },
    ]);
    expect(g).toHaveLength(3);
    expect(g.find((b) => b.giftBoxRef === null)!.items).toHaveLength(1);
    expect(g.filter((b) => b.giftBoxRef !== null)).toHaveLength(2);
  });
});
