import { describe, expect, test } from "bun:test";
import { type PricingItem, computeGiftBoxPrice } from "./gift-box-pricing.ts";

const items: PricingItem[] = [
  { product_id: "p1", variant_id: null, vendor_id: "v1", quantity: 2, unit_price: 1000 }, // 2000
  { product_id: "p2", variant_id: "x", vendor_id: "v2", quantity: 1, unit_price: 5000 }, // 5000
];

describe("computeGiftBoxPrice", () => {
  test("sums items + packaging with no discount", () => {
    const r = computeGiftBoxPrice({ items, packagingPrice: 1500, discountPercentage: null });
    expect(r.itemsSubtotal).toBe(7000);
    expect(r.discount).toBe(0);
    expect(r.packaging).toBe(1500);
    expect(r.total).toBe(8500);
  });

  test("applies discount to items subtotal only, rounded to fils", () => {
    const r = computeGiftBoxPrice({ items, packagingPrice: 1500, discountPercentage: 10 });
    expect(r.discount).toBe(700); // 10% of 7000
    expect(r.total).toBe(7800); // 7000 - 700 + 1500
  });

  test("per-vendor breakdown groups items subtotal by vendor", () => {
    const r = computeGiftBoxPrice({ items, packagingPrice: 0, discountPercentage: null });
    expect(r.perVendor).toEqual({ v1: 2000, v2: 5000 });
  });

  test("rounds half-up on fractional discount", () => {
    const one: PricingItem[] = [
      { product_id: "p", variant_id: null, vendor_id: "v", quantity: 1, unit_price: 333 },
    ];
    const r = computeGiftBoxPrice({ items: one, packagingPrice: 0, discountPercentage: 10 });
    expect(r.discount).toBe(33); // round(33.3)
  });
});
