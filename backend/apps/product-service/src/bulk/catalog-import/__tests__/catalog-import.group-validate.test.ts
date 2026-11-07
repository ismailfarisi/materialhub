import { describe, expect, test } from "bun:test";
import { BulkImportMode } from "@materialhub/database";
import type { CatalogImportCtx } from "../catalog-import.context.ts";
import type { CoercedProductRow } from "../catalog-import.schemas.ts";
import { crossValidate } from "../catalog-import.validate.ts";

function mkCtx(overrides: Partial<CatalogImportCtx> = {}): CatalogImportCtx {
  return {
    vendorId: "v-1",
    mode: BulkImportMode.Upsert,
    defaultWarehouseId: "w-1",
    categoriesBySlug: new Map([["kraft-papers", { id: "c-1", slug: "kraft-papers" }]]),
    brandsBySlug: new Map(),
    attributesBySlug: new Map([
      [
        "color",
        {
          id: "a-color",
          slug: "color",
          type: "color",
          isFilterable: true,
          isVariant: true,
          isGroupable: true,
          valuesBySlug: new Map([
            ["red", { id: "av-red", slug: "red", value: "Red" }],
            ["pink", { id: "av-pink", slug: "pink", value: "Pink" }],
          ]),
        },
      ],
      [
        "finish",
        {
          id: "a-finish",
          slug: "finish",
          type: "select",
          isFilterable: true,
          isVariant: false,
          isGroupable: false,
          valuesBySlug: new Map([["matte", { id: "av-matte", slug: "matte", value: "Matte" }]]),
        },
      ],
    ]),
    requiredAttrsByCategory: new Map([["c-1", new Set()]]),
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
    categorySlug: "kraft-papers",
    brandSlug: null,
    status: null,
    price: 1000,
    compareAtPrice: null,
    costPrice: null,
    currency: null,
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
    attributes: [],
    ...over,
  };
}

describe("crossValidate - product groups", () => {
  const redRow = mkProd({
    rowNumber: 1,
    externalId: "P-1",
    groupName: "Kraft Paper 120 gsm",
    groupAttribute: "color",
    attributes: [{ slug: "color", value: "red" }],
  });
  const pinkRow = mkProd({
    rowNumber: 2,
    externalId: "P-2",
    groupName: "Kraft Paper 120 gsm",
    groupAttribute: "color",
    attributes: [{ slug: "color", value: "pink" }],
  });

  test("accepts a valid color family", () => {
    const { errors } = crossValidate([redRow, pinkRow], [], mkCtx());
    expect(
      errors.filter(
        (e) =>
          e.field === "group_name" ||
          e.errorCode.startsWith("group") ||
          e.errorCode.includes("group"),
      ),
    ).toHaveLength(0);
  });

  test("group_name without group_attribute errors", () => {
    const { errors } = crossValidate(
      [
        mkProd({
          groupName: "Kraft Paper 120 gsm",
          groupAttribute: null,
          attributes: [{ slug: "color", value: "red" }],
        }),
      ],
      [],
      mkCtx(),
    );
    expect(errors.some((e) => e.errorCode === "group_attribute_required")).toBe(true);
  });

  test("non-groupable grouping attribute errors", () => {
    const { errors } = crossValidate(
      [
        mkProd({
          groupName: "G",
          groupAttribute: "finish",
          attributes: [{ slug: "finish", value: "matte" }],
        }),
      ],
      [],
      mkCtx(),
    );
    expect(errors.some((e) => e.errorCode === "attribute_not_groupable")).toBe(true);
  });

  test("missing grouping value errors", () => {
    const { errors } = crossValidate(
      [mkProd({ groupName: "G", groupAttribute: "color", attributes: [] })],
      [],
      mkCtx(),
    );
    expect(errors.some((e) => e.errorCode === "group_value_missing")).toBe(true);
  });

  test("inconsistent group_attribute within a group errors", () => {
    const r2 = mkProd({
      rowNumber: 2,
      externalId: "P-2",
      groupName: "Kraft Paper 120 gsm",
      groupAttribute: "finish",
      attributes: [{ slug: "finish", value: "matte" }],
    });
    const { errors } = crossValidate([redRow, r2], [], mkCtx());
    expect(errors.some((e) => e.errorCode === "inconsistent_group_attribute")).toBe(true);
  });

  test("duplicate colour within a group errors", () => {
    const dup = mkProd({
      rowNumber: 2,
      externalId: "P-2",
      groupName: "Kraft Paper 120 gsm",
      groupAttribute: "color",
      attributes: [{ slug: "color", value: "red" }],
    });
    const { errors } = crossValidate([redRow, dup], [], mkCtx());
    expect(errors.some((e) => e.errorCode === "duplicate_group_value")).toBe(true);
  });
});
