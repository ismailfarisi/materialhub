import { describe, expect, it } from "bun:test";
import { assignPositions, buildCollectionSlug, shapeItems } from "./collection.service.ts";

describe("buildCollectionSlug", () => {
  it("slugifies the name", () => {
    expect(buildCollectionSlug("Summer Sale 2026")).toBe("summer-sale-2026");
  });
  it("uses provided slug verbatim (slugified)", () => {
    expect(buildCollectionSlug("Summer Sale", "my-custom")).toBe("my-custom");
  });
});

describe("assignPositions", () => {
  it("assigns sequential positions from the input order", () => {
    expect(assignPositions(["a", "b", "c"])).toEqual([
      { id: "a", position: 0 },
      { id: "b", position: 1 },
      { id: "c", position: 2 },
    ]);
  });
});

describe("shapeItems", () => {
  it("joins items to products, primary image first, falls back for missing product", () => {
    const items = [
      { id: "i1", product_id: "p1", position: 0, source_sku: "S1" },
      { id: "i2", product_id: "pX", position: 1, source_sku: "SX" },
    ] as any;
    const products = [
      {
        id: "p1",
        name: "Serum",
        slug: "serum",
        sku: "PROD-1",
        images: [
          { is_primary: false, url: "u-sec", thumbnail_url: "t-sec" },
          { is_primary: true, url: "u-pri", thumbnail_url: "t-pri" },
        ],
      },
    ] as any;
    const out = shapeItems(items, products);
    expect(out[0]).toEqual({
      item_id: "i1",
      product_id: "p1",
      name: "Serum",
      sku: "PROD-1",
      image_url: "t-pri",
      position: 0,
    });
    expect(out[1]).toEqual({
      item_id: "i2",
      product_id: "pX",
      name: "(unavailable product)",
      sku: "SX",
      image_url: null,
      position: 1,
    });
  });
});
