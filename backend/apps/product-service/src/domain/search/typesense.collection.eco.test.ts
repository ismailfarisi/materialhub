import { describe, expect, it } from "bun:test";
import {
  attributeFilterField,
  productCollectionSchema,
  productToDocument,
  typedAttributeFields,
} from "./typesense.collection.ts";

const base = {
  id: "p1",
  name: "Kraft paper carry bag",
  slug: "kraft-bag",
  price: 18750,
  vendor_id: "v1",
  status: "published",
  created_at: "2026-11-01T00:00:00Z",
};

describe("eco catalogue index fields", () => {
  it("declares plastic_ban_ready and bag thickness as facetable fields", () => {
    const fields = productCollectionSchema.fields as Array<{
      name: string;
      type: string;
      facet?: boolean;
    }>;
    expect(fields.find((f) => f.name === "plastic_ban_ready")).toMatchObject({
      type: "bool",
      facet: true,
    });
    expect(fields.find((f) => f.name === "attr_bag_thickness_microns")).toMatchObject({
      type: "int32",
    });
  });

  it("is plastic-ban ready only for an approved declaration", () => {
    for (const status of ["pending", "rejected", "withdrawn"]) {
      expect(productToDocument({ ...base, ecoDeclaration: { status } }).plastic_ban_ready).toBe(
        false,
      );
    }
    expect(productToDocument(base).plastic_ban_ready).toBe(false);
    expect(
      productToDocument({ ...base, ecoDeclaration: { status: "approved" } }).plastic_ban_ready,
    ).toBe(true);
  });

  it("indexes number and boolean attributes as typed attr_ fields", () => {
    const attributeValues = [
      { attribute: { slug: "bag-thickness-microns", type: "number" }, text_value: "110" },
      { attribute: { slug: "food-safe", type: "boolean" }, text_value: "true" },
      { attribute: { slug: "finish", type: "text" }, text_value: "matte" },
      { attribute: { slug: "gsm", type: "number" }, text_value: "not a number" },
      // variant-level rows are not product-level facts
      { attribute: { slug: "width", type: "number" }, text_value: "5", variant_id: "x" },
    ];
    expect(typedAttributeFields(attributeValues)).toEqual({
      attr_bag_thickness_microns: 110,
      attr_food_safe: true,
    });
    const doc = productToDocument({ ...base, attributeValues });
    expect(doc.attr_bag_thickness_microns).toBe(110);
  });

  it("builds field names Typesense can filter on", () => {
    expect(attributeFilterField("bag-thickness-microns")).toBe("attr_bag_thickness_microns");
    expect(attributeFilterField("on_sale")).toBe("attr_on_sale");
  });
});
