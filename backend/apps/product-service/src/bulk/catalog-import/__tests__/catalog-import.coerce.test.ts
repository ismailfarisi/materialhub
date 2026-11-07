import { describe, expect, test } from "bun:test";
import type { ParsedRow } from "@materialhub/bulk-jobs";
import { BulkImportMode } from "@materialhub/database";
import { coerceProductRow, coerceVariantRow } from "../catalog-import.coerce.ts";

function mk(values: Record<string, string>, n = 1, sheet = "Products") {
  return { rowNumber: n, sheetName: sheet, values };
}

describe("coerceProductRow", () => {
  test("coerces numeric fields and splits arrays", () => {
    const r = coerceProductRow(
      mk({
        sku: "T-1",
        name: "Tee",
        category_slug: "kraft-papers",
        price: "9900",
        tags: "a|b|c",
        image_urls: "https://x/1.jpg|https://x/2.jpg",
        has_variants: "false",
        "attr.color": "red",
        "attr.material": "cotton",
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.price).toBe(9900);
      expect(r.value.tags).toEqual(["a", "b", "c"]);
      expect(r.value.imageUrls).toHaveLength(2);
      expect(r.value.attributes).toEqual([
        { slug: "color", value: "red" },
        { slug: "material", value: "cotton" },
      ]);
    }
  });

  test("rejects missing required fields with per-field errors", () => {
    const r = coerceProductRow(mk({ sku: "T-1" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const fields = r.errors.map((e) => e.field);
      expect(fields).toContain("name");
      expect(fields).toContain("category_slug");
      expect(fields).toContain("price");
    }
  });

  test("rejects negative price", () => {
    const r = coerceProductRow(mk({ sku: "T-1", name: "X", category_slug: "c", price: "-1" }));
    if (!r.ok) expect(r.errors[0]!.errorCode).toBe("invalid_price");
  });

  test("coerces free-text editorial fields (ingredients, usage, short description)", () => {
    const r = coerceProductRow(
      mk({
        sku: "T-1",
        name: "Kraft Paper 120 gsm",
        category_slug: "kraft-papers",
        price: "9900",
        short_description: "Unbleached 120 gsm kraft, A1 sheets",
        ingredients: "100% virgin kraft pulp, FSC Mix",
        usage_instructions: "Store flat and dry.",
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.shortDescription).toBe("Unbleached 120 gsm kraft, A1 sheets");
      expect(r.value.ingredients).toBe("100% virgin kraft pulp, FSC Mix");
      expect(r.value.usageInstructions).toBe("Store flat and dry.");
    }
  });

  test("accepts singular usage_instruction column for vendor templates", () => {
    const r = coerceProductRow(
      mk({
        sku: "T-1",
        name: "Kraft Paper 120 gsm",
        category_slug: "kraft-papers",
        price: "9900",
        ingredients: "Recycled fibre",
        usage_instruction: "Fold along the grain.",
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.ingredients).toBe("Recycled fibre");
      expect(r.value.usageInstructions).toBe("Fold along the grain.");
    }
  });

  test("free-text editorial fields default to null when blank or absent", () => {
    const r = coerceProductRow(
      mk({
        sku: "T-1",
        name: "X",
        category_slug: "c",
        price: "100",
        ingredients: "   ",
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.shortDescription).toBeNull();
      expect(r.value.ingredients).toBeNull();
      expect(r.value.usageInstructions).toBeNull();
    }
  });
});

describe("coerceProductRow — update mode", () => {
  function row(values: Record<string, string>): ParsedRow {
    return { rowNumber: 2, sheetName: "Products", values };
  }

  test("upsert mode still requires name, category_slug, price", () => {
    const r = coerceProductRow(row({ sku: "SKU1" }), BulkImportMode.Upsert);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const codes = r.errors.map((e) => e.errorMessage);
      expect(codes).toContain("name is required");
      expect(codes).toContain("category_slug is required");
      expect(codes).toContain("price is required");
    }
  });

  test("update mode: sku + price only is valid (no name/category required)", () => {
    const r = coerceProductRow(row({ sku: "SKU1", price: "1999" }), BulkImportMode.Update);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.sku).toBe("SKU1");
      expect(r.value.price).toBe(1999);
      expect(r.value.name).toBeNull();
      expect(r.value.categorySlug).toBeNull();
    }
  });

  test("update mode still requires a key (external_id or sku)", () => {
    const r = coerceProductRow(row({ price: "1999" }), BulkImportMode.Update);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.map((e) => e.errorMessage)).toContain("external_id or sku is required");
    }
  });

  test("update mode still rejects a negative price when provided", () => {
    const r = coerceProductRow(row({ sku: "SKU1", price: "-5" }), BulkImportMode.Update);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.errorCode === "invalid_price")).toBe(true);
    }
  });
});

describe("coerceVariantRow", () => {
  test("parses option.* columns", () => {
    const r = coerceVariantRow(
      mk(
        {
          product_sku: "P-1",
          variant_sku: "P-1-RED",
          "option.color": "red",
          "option.size": "m",
        },
        1,
        "Variants",
      ),
    );
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.value.optionValues).toEqual([
        { slug: "color", value: "red" },
        { slug: "size", value: "m" },
      ]);
  });
});
