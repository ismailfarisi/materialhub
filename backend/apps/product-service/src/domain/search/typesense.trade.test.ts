import { describe, expect, it } from "bun:test";
import { attachPriceTiers } from "../product/product.service.ts";
import { productToDocument } from "./typesense.collection.ts";

const base = {
  id: "p1",
  name: "Kraft paper 120 gsm",
  slug: "kraft-paper-120",
  price: 900,
  status: "published",
  vendor_id: "v1",
  vendor: { name: "Board Supply" },
  category: { name: "Papers & boards", slug: "papers-boards" },
  created_at: "2026-11-01T00:00:00Z",
};

describe("productToDocument — trade pricing", () => {
  it("indexes the lowest tier as the 'from' price, with unit and minimum", () => {
    const doc = productToDocument({
      ...base,
      unit_of_measure: "roll",
      min_order_quantity: 5,
      order_increment: 1,
      variants: [],
      price_tiers: [
        { variant_id: null, min_quantity: 20, unit_price: 800 },
        { variant_id: null, min_quantity: 50, unit_price: 720 },
      ],
    });
    expect(doc).toMatchObject({
      price_min: 900,
      tier_price_min: 720,
      unit_of_measure: "roll",
      min_order_quantity: 5,
      has_trade_rules: true,
    });
    expect(doc.has_sample).toBeUndefined();
  });

  it("keeps samples out of prices and SKUs but flags has_sample", () => {
    const doc = productToDocument({
      ...base,
      has_variants: true,
      variants: [
        {
          id: "a",
          price: 600,
          is_active: true,
          sku: "GB-70",
          unit_of_measure: "sheet",
          min_order_quantity: 1,
        },
        {
          id: "b",
          price: 5500,
          is_active: true,
          sku: "GB-CTN",
          unit_of_measure: "carton",
          order_increment: 2,
        },
        { id: "s", price: 100, is_active: true, sku: "GB-SAMPLE", is_sample: true },
      ],
      price_tiers: [{ variant_id: "a", min_quantity: 100, unit_price: 540 }],
    });
    expect(doc.price_min).toBe(600);
    expect(doc.price_max).toBe(5500);
    expect(doc.tier_price_min).toBe(540);
    expect(doc.unit_of_measure).toBe("sheet");
    expect(doc.has_trade_rules).toBe(true);
    expect(doc.has_sample).toBe(true);
    expect(doc.skus).not.toContain("GB-SAMPLE");
    expect(doc.min_order_quantity).toBeUndefined();
  });

  it("adds nothing for a plain listing", () => {
    const doc = productToDocument({ ...base, variants: [] });
    for (const k of [
      "tier_price_min",
      "unit_of_measure",
      "min_order_quantity",
      "has_trade_rules",
      "has_sample",
    ]) {
      expect(k in doc).toBe(false);
    }
  });
});

describe("attachPriceTiers", () => {
  it("gives each variant its tiers and leaves product-level ones on the product", () => {
    const product: any = {
      variants: [{ id: "a" }, { id: "s", is_sample: true }],
      price_tiers: [
        { id: "t2", variant_id: "a", min_quantity: 200, unit_price: 480 },
        { id: "t1", variant_id: "a", min_quantity: 50, unit_price: 540 },
        { id: "t3", variant_id: null, min_quantity: 10, unit_price: 800 },
        { id: "t4", variant_id: "s", min_quantity: 10, unit_price: 1 },
      ],
    };
    attachPriceTiers(product);
    expect(product.variants[0].price_tiers).toEqual([
      { min_quantity: 50, unit_price: 540 },
      { min_quantity: 200, unit_price: 480 },
    ]);
    expect(product.variants[1].price_tiers).toEqual([]);
    expect(product.price_tiers).toEqual([{ min_quantity: 10, unit_price: 800 }]);
  });
});
