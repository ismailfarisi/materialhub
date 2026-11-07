import { describe, expect, test } from "bun:test";
import type { ParsedRow, WriteContext } from "@materialhub/bulk-jobs";
import { BulkImportMode } from "@materialhub/database";
import type { EntityManager } from "typeorm";
import { coerceProductRow, coerceVariantRow } from "../catalog-import.coerce.ts";
import type { CatalogImportCtx } from "../catalog-import.context.ts";
import { writeProductsBatch, writeUpdateBatch } from "../catalog-import.write.ts";

/**
 * Regression guard for C1 + C2: in update mode, an absent/blank source cell
 * must LEAVE THE EXISTING VALUE UNCHANGED, not overwrite it with a coerce
 * default/null. Drives the real coerce functions (so the coerce-side bug is
 * exercised) into a mocked-EntityManager writeProductsBatch call (so the
 * write-loop-side bug is exercised too) — no live DB, per this repo's
 * mocked-repo test convention.
 *
 * The mock resolves rows by `where.id` (NOT by entity-class name): matching on
 * `entity.name` proved brittle across build/run environments (it worked locally
 * but fell through to the null branch in CI, breaking these tests). Keying on the
 * lookup id is behavior-based and environment-independent.
 */

function mkRow(values: Record<string, string>, n: number, sheet: string): ParsedRow {
  return { rowNumber: n, sheetName: sheet, values };
}

/**
 * Build a mocked EntityManager whose repositories are all backed by one
 * id-keyed row store. `findOne({ where: { id } })` returns `rowsById[id]` (or
 * null), and `update(id, payload)` records the payload into `captured[id]`.
 */
function mkManager(rowsById: Record<string, Record<string, unknown>>): {
  manager: EntityManager;
  captured: Record<string, Record<string, unknown>>;
} {
  const captured: Record<string, Record<string, unknown>> = {};
  const repo = {
    findOne: async (opts?: { where?: { id?: string } }) => {
      const id = opts?.where?.id;
      return (id && rowsById[id]) || null;
    },
    update: async (id: string, payload: Record<string, unknown>) => {
      captured[id] = payload;
    },
    insert: async () => ({ identifiers: [{ id: "inserted" }] }),
  };
  const manager = {
    query: async () => [],
    getRepository: () => repo,
  } as unknown as EntityManager;
  return { manager, captured };
}

function baseCtx(overrides: Partial<CatalogImportCtx>): CatalogImportCtx {
  return {
    vendorId: "vendor-1",
    mode: BulkImportMode.Update,
    defaultWarehouseId: null,
    categoriesBySlug: new Map(),
    brandsBySlug: new Map(),
    attributesBySlug: new Map(),
    requiredAttrsByCategory: new Map(),
    productsBySku: new Map(),
    productsByExternalId: new Map(),
    variantsByProductAndSku: new Map(),
    variantsByProductAndExternalId: new Map(),
    googleDriveApiKey: null,
    ...overrides,
  };
}

function mkWriteCtx(manager: EntityManager): WriteContext {
  return {
    job: { id: "job-1", summary: null } as unknown as WriteContext["job"],
    manager,
    batchIndex: 0,
    logChange: () => {},
    pushFollowUp: () => {},
  };
}

const currentProduct = {
  id: "prod-1",
  sku: "SKU-1",
  external_id: null,
  name: "Old",
  short_description: null,
  description: null,
  ingredients: null,
  usage_instructions: null,
  price: 1000,
  compare_at_price: null,
  cost_price: null,
  currency: "AED",
  has_variants: true,
  track_inventory: true,
  allow_backorder: false,
  requires_shipping: true,
  weight_grams: null,
  barcode: null,
  mpn: null,
  meta_title: null,
  meta_description: null,
  meta_keywords: null,
  status: "draft",
  category_id: null,
  brand_id: null,
} as const;

describe("catalog-import write path — update mode leaves unspecified columns unchanged", () => {
  test("product update: a price-only row does not touch has_variants/name/track_inventory/allow_backorder/requires_shipping", async () => {
    const { manager, captured } = mkManager({ "prod-1": { ...currentProduct } });

    const ctx = baseCtx({
      productsBySku: new Map([
        ["SKU-1", { productId: "prod-1", hasVariants: true, deleted: false }],
      ]),
    });

    // Only sku + price supplied — every other column is blank, exactly what a
    // "price-only" partial-update spreadsheet row looks like.
    const coerced = coerceProductRow(
      mkRow({ sku: "SKU-1", price: "1500" }, 2, "Products"),
      BulkImportMode.Update,
    );
    expect(coerced.ok).toBe(true);
    if (!coerced.ok) return;

    const result = await writeProductsBatch([coerced.value], [], ctx, mkWriteCtx(manager));

    expect(result.skippedRowNumbers).toEqual([]);
    const capturedProductUpdate = captured["prod-1"];
    expect(capturedProductUpdate).toBeDefined();
    expect(capturedProductUpdate).toHaveProperty("price", 1500);
    expect(capturedProductUpdate).not.toHaveProperty("has_variants");
    expect(capturedProductUpdate).not.toHaveProperty("name");
    expect(capturedProductUpdate).not.toHaveProperty("track_inventory");
    expect(capturedProductUpdate).not.toHaveProperty("requires_shipping");
    expect(capturedProductUpdate).not.toHaveProperty("allow_backorder");
  });

  test("variant update: a price-only row does not touch name/option_values/is_active/sort_order", async () => {
    const currentVariant = {
      id: "var-2",
      product_id: "prod-2",
      sku: "VAR-SKU-2",
      external_id: null,
      name: "V",
      price: 500,
      compare_at_price: null,
      cost_price: null,
      weight_grams: null,
      barcode: null,
      is_active: false,
      sort_order: 3,
      option_values: { a: "1" },
    };

    const { manager, captured } = mkManager({
      "prod-2": { ...currentProduct, id: "prod-2", sku: "SKU-2", name: "Parent" },
      "var-2": currentVariant,
    });

    const ctx = baseCtx({
      productsBySku: new Map([
        ["SKU-2", { productId: "prod-2", hasVariants: true, deleted: false }],
      ]),
      variantsByProductAndSku: new Map([
        ["prod-2|VAR-SKU-2", { variantId: "var-2", productId: "prod-2", deleted: false }],
      ]),
    });

    const coercedProduct = coerceProductRow(
      mkRow({ sku: "SKU-2" }, 2, "Products"),
      BulkImportMode.Update,
    );
    expect(coercedProduct.ok).toBe(true);
    if (!coercedProduct.ok) return;

    // Only variant_sku + price supplied — everything else (name, options,
    // is_active, sort_order) is blank.
    const coercedVariant = coerceVariantRow(
      mkRow({ product_sku: "SKU-2", variant_sku: "VAR-SKU-2", price: "700" }, 3, "Variants"),
      BulkImportMode.Update,
    );
    expect(coercedVariant.ok).toBe(true);
    if (!coercedVariant.ok) return;

    const result = await writeProductsBatch(
      [coercedProduct.value],
      [coercedVariant.value],
      ctx,
      mkWriteCtx(manager),
    );

    expect(result.skippedRowNumbers).toEqual([]);
    const capturedVariantUpdate = captured["var-2"];
    expect(capturedVariantUpdate).toBeDefined();
    expect(capturedVariantUpdate).toHaveProperty("price", 700);
    expect(capturedVariantUpdate).not.toHaveProperty("name");
    expect(capturedVariantUpdate).not.toHaveProperty("option_values");
    expect(capturedVariantUpdate).not.toHaveProperty("is_active");
    expect(capturedVariantUpdate).not.toHaveProperty("sort_order");
  });
});

/**
 * Regression guard for I1: in update mode, a variant whose parent product
 * isn't ALSO listed in the file's Products sheet (e.g. a variant-only file,
 * `variant_sku,price`) must still be written — its parent resolves from the
 * DB-preloaded ctx.productsBySku/productsByExternalId, not from in-file
 * products.
 */
describe("catalog-import write path — writeUpdateBatch resolves variant parent from DB", () => {
  test("variant-only batch (no products in this call) still writes the variant via DB-resolved parent", async () => {
    const currentVariant = {
      id: "var-3",
      product_id: "prod-3",
      sku: "VAR-SKU-3",
      external_id: null,
      name: "V3",
      price: 500,
      compare_at_price: null,
      cost_price: null,
      weight_grams: null,
      barcode: null,
      is_active: true,
      sort_order: 0,
      option_values: {},
    };

    const { manager, captured } = mkManager({ "var-3": currentVariant });

    const ctx = baseCtx({
      productsBySku: new Map([
        ["SKU-3", { productId: "prod-3", hasVariants: true, deleted: false }],
      ]),
      variantsByProductAndSku: new Map([
        ["prod-3|VAR-SKU-3", { variantId: "var-3", productId: "prod-3", deleted: false }],
      ]),
    });

    // Variant-only file: no Products sheet rows in this call at all — the
    // parent product is never re-listed, only resolvable via ctx from the DB.
    const coercedVariant = coerceVariantRow(
      mkRow({ product_sku: "SKU-3", variant_sku: "VAR-SKU-3", price: "900" }, 2, "Variants"),
      BulkImportMode.Update,
    );
    expect(coercedVariant.ok).toBe(true);
    if (!coercedVariant.ok) return;

    const result = await writeUpdateBatch([], [coercedVariant.value], ctx, mkWriteCtx(manager));

    expect(result.skippedRowNumbers).toEqual([]);
    expect(result.succeededRowNumbers).toEqual([2]);
    const capturedVariantUpdate = captured["var-3"];
    expect(capturedVariantUpdate).toBeDefined();
    expect(capturedVariantUpdate).toHaveProperty("price", 900);
  });

  test("variant whose parent is absent from ctx is skipped with update_product_not_found", async () => {
    const { manager } = mkManager({});

    // No entry for SKU-404 in productsBySku/productsByExternalId — simulates
    // a variant row whose parent product doesn't exist (defense-in-depth;
    // crossValidate would normally catch this earlier).
    const ctx = baseCtx({});

    const coercedVariant = coerceVariantRow(
      mkRow({ product_sku: "SKU-404", variant_sku: "VAR-SKU-404", price: "900" }, 5, "Variants"),
      BulkImportMode.Update,
    );
    expect(coercedVariant.ok).toBe(true);
    if (!coercedVariant.ok) return;

    const result = await writeUpdateBatch([], [coercedVariant.value], ctx, mkWriteCtx(manager));

    expect(result.succeededRowNumbers).toEqual([]);
    expect(result.skippedRowNumbers).toHaveLength(1);
    expect(result.skippedRowNumbers[0]).toMatchObject({
      rowNumber: 5,
      errorCode: "update_product_not_found",
    });
  });
});
