import { describe, expect, test } from "bun:test";
import { BulkImportMode } from "@materialhub/database";
import type { CatalogImportCtx, ResolvedVariantKey } from "../catalog-import.context.ts";
import type { CoercedProductRow, CoercedVariantRow } from "../catalog-import.schemas.ts";
import { crossValidate } from "../catalog-import.validate.ts";

function mkCtx(overrides: Partial<CatalogImportCtx> = {}): CatalogImportCtx {
  return {
    vendorId: "v-1",
    mode: BulkImportMode.Upsert,
    defaultWarehouseId: "w-1",
    categoriesBySlug: new Map([["men", { id: "c-1", slug: "men" }]]),
    brandsBySlug: new Map(),
    attributesBySlug: new Map([
      [
        "color",
        {
          id: "a-color",
          slug: "color",
          type: "select",
          isFilterable: true,
          isVariant: true,
          isGroupable: false,
          valuesBySlug: new Map([["red", { id: "av-red", slug: "red", value: "Red" }]]),
        },
      ],
      [
        "material",
        {
          id: "a-mat",
          slug: "material",
          type: "text",
          isFilterable: false,
          isVariant: false,
          isGroupable: false,
          valuesBySlug: new Map(),
        },
      ],
    ]),
    requiredAttrsByCategory: new Map([["c-1", new Set(["color"])]]),
    productsBySku: new Map(),
    productsByExternalId: new Map(),
    variantsByProductAndSku: new Map(),
    variantsByProductAndExternalId: new Map(),
    googleDriveApiKey: null,
    ...overrides,
  };
}

function mkProd(over: Partial<CoercedProductRow>): CoercedProductRow {
  return {
    rowNumber: 1,
    externalId: "P-1",
    sku: null,
    name: "P1",
    slug: null,
    shortDescription: null,
    description: null,
    ingredients: null,
    usageInstructions: null,
    categorySlug: "men",
    brandSlug: null,
    status: "draft",
    price: 1000,
    compareAtPrice: null,
    costPrice: null,
    currency: "AED",
    hasVariants: false,
    trackInventory: true,
    allowBackorder: false,
    requiresShipping: true,
    weightGrams: null,
    barcode: null,
    mpn: null,
    tags: [],
    metaTitle: null,
    metaDescription: null,
    metaKeywords: null,
    imageUrls: [],
    initialQuantity: null,
    groupName: null,
    groupAttribute: null,
    attributes: [{ slug: "color", value: "red" }],
    ...over,
  };
}

function mkVariant(over: Partial<CoercedVariantRow>): CoercedVariantRow {
  return {
    rowNumber: 1,
    productExternalId: null,
    productSku: "SKU-EXIST",
    variantExternalId: null,
    variantSku: null,
    name: null,
    price: null,
    compareAtPrice: null,
    costPrice: null,
    weightGrams: null,
    lengthCm: null,
    widthCm: null,
    heightCm: null,
    barcode: null,
    isActive: true,
    sortOrder: 0,
    initialQuantity: null,
    imageUrls: [],
    optionValues: [],
    ...over,
  };
}

describe("crossValidate — update mode", () => {
  test("matched product with only sku+price passes (no category needed)", () => {
    const ctx = mkCtx({
      mode: BulkImportMode.Update,
      productsBySku: new Map([
        ["SKU-EXIST", { productId: "p1", hasVariants: false, deleted: false }],
      ]),
    });
    const products = [
      mkProd({
        sku: "SKU-EXIST",
        externalId: null,
        name: null,
        categorySlug: null,
        attributes: [],
      }),
    ];
    const { errors, validProducts } = crossValidate(products, [], ctx);
    expect(errors).toEqual([]);
    expect(validProducts.map((p) => p.sku)).toEqual(["SKU-EXIST"]);
  });

  test("unmatched product key errors UPDATE_PRODUCT_NOT_FOUND", () => {
    const ctx = mkCtx({ mode: BulkImportMode.Update, productsBySku: new Map() });
    const products = [
      mkProd({ sku: "SKU-GONE", externalId: null, name: null, categorySlug: null, attributes: [] }),
    ];
    const { errors, validProducts } = crossValidate(products, [], ctx);
    expect(errors.some((e) => e.errorCode === "update_product_not_found")).toBe(true);
    expect(validProducts).toEqual([]);
  });

  test("unmatched variant key errors UPDATE_VARIANT_NOT_FOUND", () => {
    const ctx = mkCtx({
      mode: BulkImportMode.Update,
      productsBySku: new Map([
        ["SKU-EXIST", { productId: "p1", hasVariants: true, deleted: false }],
      ]),
      variantsByProductAndSku: new Map<string, ResolvedVariantKey>(),
    });
    const variants = [mkVariant({ productSku: "SKU-EXIST", variantSku: "VAR-GONE" })];
    const { errors, validVariants } = crossValidate([], variants, ctx);
    expect(errors.some((e) => e.errorCode === "update_variant_not_found")).toBe(true);
    expect(validVariants).toEqual([]);
  });

  test("variant with unmatched parent product errors UPDATE_PRODUCT_NOT_FOUND (not unknown_product)", () => {
    const ctx = mkCtx({
      mode: BulkImportMode.Update,
      productsBySku: new Map(),
    });
    const variants = [mkVariant({ productSku: "SKU-GONE", variantSku: "VAR-1" })];
    const { errors, validVariants } = crossValidate([], variants, ctx);
    expect(errors.some((e) => e.errorCode === "update_product_not_found")).toBe(true);
    expect(errors.some((e) => e.errorCode === "unknown_product")).toBe(false);
    expect(validVariants).toEqual([]);
  });

  test("matched variant with existing product+variant passes", () => {
    const ctx = mkCtx({
      mode: BulkImportMode.Update,
      productsBySku: new Map([
        ["SKU-EXIST", { productId: "p1", hasVariants: true, deleted: false }],
      ]),
      variantsByProductAndSku: new Map([
        ["p1|VAR-EXIST", { variantId: "var-1", productId: "p1", deleted: false }],
      ]),
    });
    const variants = [mkVariant({ productSku: "SKU-EXIST", variantSku: "VAR-EXIST" })];
    const { errors, validVariants } = crossValidate([], variants, ctx);
    expect(errors).toEqual([]);
    expect(validVariants.map((v) => v.variantSku)).toEqual(["VAR-EXIST"]);
  });
});

describe("crossValidate", () => {
  test("accepts product with required attribute present", () => {
    const { errors } = crossValidate([mkProd({})], [], mkCtx());
    expect(errors).toHaveLength(0);
  });

  test("allows category attributes to be omitted", () => {
    const { errors } = crossValidate([mkProd({ attributes: [] })], [], mkCtx());
    expect(errors).toHaveLength(0);
  });

  test("errors on unknown category", () => {
    const { errors } = crossValidate([mkProd({ categorySlug: "nope" })], [], mkCtx());
    expect(errors[0]?.errorCode).toBe("unknown_category");
  });

  test("errors on unknown attribute value", () => {
    const { errors } = crossValidate(
      [mkProd({ attributes: [{ slug: "color", value: "rainbow" }] })],
      [],
      mkCtx(),
    );
    expect(errors[0]?.errorCode).toBe("unknown_attribute_value");
  });

  test("errors on duplicate external_id within file", () => {
    const ctx = mkCtx();
    const { errors } = crossValidate(
      [mkProd({ externalId: "DUP" }), mkProd({ rowNumber: 2, externalId: "DUP" })],
      [],
      ctx,
    );
    expect(errors.some((e) => e.errorCode === "duplicate_key_in_file")).toBe(true);
  });

  test("variant missing parent → unknown_product", () => {
    const variant: CoercedVariantRow = {
      rowNumber: 1,
      productExternalId: "MISSING",
      productSku: null,
      variantExternalId: "V-1",
      variantSku: null,
      name: null,
      price: null,
      compareAtPrice: null,
      costPrice: null,
      weightGrams: null,
      lengthCm: null,
      widthCm: null,
      heightCm: null,
      barcode: null,
      isActive: true,
      sortOrder: 0,
      initialQuantity: null,
      imageUrls: [],
      optionValues: [{ slug: "color", value: "red" }],
    };
    const { errors } = crossValidate([], [variant], mkCtx());
    expect(errors[0]?.errorCode).toBe("unknown_product");
  });
});
