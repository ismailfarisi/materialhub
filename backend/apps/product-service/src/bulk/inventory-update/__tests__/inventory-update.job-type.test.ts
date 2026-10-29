import { describe, expect, test } from "bun:test";
import {
  BulkErrorCodes,
  ErrorAccumulator,
  type WriteContext,
  validateRowSchema,
} from "@materialhub/bulk-jobs";
import { type InventoryUpdateCtx, inventoryUpdateJobType } from "../inventory-update.job-type.ts";
import { type InventoryUpdateRow, InventoryUpdateRowSchema } from "../inventory-update.schema.ts";

const ctx: InventoryUpdateCtx = {
  vendorId: "v-1",
  defaultWarehouseId: "w-1",
  bySku: new Map([
    ["SKU-A", { productId: "p-1", variantId: null, hasVariants: false, deleted: false }],
    ["SKU-B", { productId: "p-2", variantId: "var-2", hasVariants: true, deleted: false }],
  ]),
  byExternalId: new Map([
    ["ERP-X", { productId: "p-1", variantId: null, hasVariants: false, deleted: false }],
  ]),
  duplicateSkus: new Set(),
  currentQuantities: new Map([
    ["w-1|p-1|", 10],
    ["w-1|p-2|var-2", 5],
  ]),
};

function mk(values: Record<string, string>, n = 1) {
  return { rowNumber: n, sheetName: "Inventory", values };
}

describe("inventoryUpdateJobType.coerceRow", () => {
  test("accepts a row with just sku", () => {
    const r = inventoryUpdateJobType.coerceRow(
      mk({ sku: "SKU-A", quantity_on_hand: "42", note: "" }),
      ctx,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.sku).toBe("SKU-A");
      expect(r.value.external_id).toBeNull();
      expect(r.value.quantity_on_hand).toBe(42);
    }
  });

  test("rejects row missing both sku and external_id", () => {
    const r = inventoryUpdateJobType.coerceRow(mk({ quantity_on_hand: "10" }), ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]!.errorCode).toBe(BulkErrorCodes.MISSING_REQUIRED_FIELD);
  });

  // Regression for the real worker sequence: the worker runs validateRowSchema(row) —
  // which converts quantity_on_hand against a Type.Integer schema — BEFORE coerceRow(row)
  // on the same object. When Value.Convert mutated in place, quantity_on_hand became a
  // number and coerceRow's `.trim()` threw "trim is not a function". Direct-coerceRow unit
  // tests miss this because they never run the validator first.
  test("survives validateRowSchema running first (no .trim crash)", () => {
    const acc = new ErrorAccumulator();
    const row = mk({ sku: "SKU-A", quantity_on_hand: "42", note: "" });
    const valid = validateRowSchema(row, InventoryUpdateRowSchema, acc);
    expect(valid).toBe(true);
    const r = inventoryUpdateJobType.coerceRow(row, ctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.quantity_on_hand).toBe(42);
  });
});

describe("inventoryUpdateJobType.preValidate", () => {
  test("errors on unknown SKU", () => {
    const errs = inventoryUpdateJobType.preValidate!(
      [mk({ sku: "NOPE", quantity_on_hand: "5" }, 3)],
      ctx,
    );
    expect(errs).toHaveLength(1);
    expect(errs[0]!.errorCode).toBe(BulkErrorCodes.UNKNOWN_PRODUCT);
    expect(errs[0]!.rowNumber).toBe(3);
  });

  test("errors on parent product without variant specification", () => {
    const ctx2 = {
      ...ctx,
      bySku: new Map([
        ["PARENT-1", { productId: "p-3", variantId: null, hasVariants: true, deleted: false }],
      ]),
      byExternalId: new Map(),
    };
    const errs = inventoryUpdateJobType.preValidate!(
      [mk({ sku: "PARENT-1", quantity_on_hand: "5" }, 7)],
      ctx2,
    );
    expect(errs[0]!.errorCode).toBe(BulkErrorCodes.HAS_VARIANTS_BUT_NO_VARIANT_KEY);
  });

  test("errors on ambiguous duplicate SKU", () => {
    const ctx3 = {
      ...ctx,
      duplicateSkus: new Set(["DUP"]),
      bySku: new Map([
        ["DUP", { productId: "x", variantId: null, hasVariants: false, deleted: false }],
      ]),
    };
    const errs = inventoryUpdateJobType.preValidate!(
      [mk({ sku: "DUP", quantity_on_hand: "3" })],
      ctx3,
    );
    expect(errs[0]!.errorCode).toBe(BulkErrorCodes.AMBIGUOUS_PRODUCT);
  });

  test("errors on soft-deleted product", () => {
    const ctx4 = {
      ...ctx,
      bySku: new Map([
        ["DEL", { productId: "p-del", variantId: null, hasVariants: false, deleted: true }],
      ]),
    };
    const errs = inventoryUpdateJobType.preValidate!(
      [mk({ sku: "DEL", quantity_on_hand: "3" })],
      ctx4,
    );
    expect(errs[0]!.errorCode).toBe(BulkErrorCodes.SOFT_DELETED);
  });

  test("valid rows produce no errors", () => {
    const errs = inventoryUpdateJobType.preValidate!(
      [
        mk({ sku: "SKU-A", quantity_on_hand: "100" }, 1),
        mk({ external_id: "ERP-X", quantity_on_hand: "5" }, 2),
      ],
      ctx,
    );
    expect(errs).toEqual([]);
  });
});

// Regression for the production crash:
//   `null value in column "entity_id" of relation "bulk_import_job_row_changes"`
// TypeORM 0.3.28's manager.query() returns `[rows, rowCount]` (a 2-tuple) for
// UPDATE/DELETE — NOT a flat rows array like SELECT/INSERT. writeBatch read
// `result[0].id` (the rows *array*, so `.id` is undefined) and checked
// `result.length === 0` (always 2, so the INSERT fallback never ran). The
// undefined entityId then hit the diff-log's NOT NULL entity_id column.
// This surfaced only after #328 stopped the earlier coerceRow ".trim" crash.
describe("inventoryUpdateJobType.writeBatch", () => {
  function coerced(row: Partial<InventoryUpdateRow>): InventoryUpdateRow {
    return {
      sku: null,
      external_id: null,
      quantity_on_hand: 0,
      note: null,
      rowNumber: 1,
      ...row,
    };
  }

  // Simulate the TypeORM 0.3.28 return shapes: UPDATE => [rows, count], INSERT => rows.
  function mkWriteCtx(opts: {
    updateRows: Array<{ id: string }>;
    insertRows?: Array<{ id: string }>;
  }): { ctx: WriteContext; changes: Array<{ entityId: string }> } {
    const changes: Array<{ entityId: string }> = [];
    const manager = {
      query: async (sql: string) => {
        if (/^\s*UPDATE inventory/i.test(sql)) return [opts.updateRows, opts.updateRows.length];
        if (/^\s*INSERT INTO inventory/i.test(sql)) return opts.insertRows ?? [];
        return [];
      },
    };
    const writeCtx = {
      job: { id: "job-1", summary: { context: ctx } },
      manager,
      batchIndex: 0,
      logChange: (e: { entityId: string }) => changes.push(e),
      pushFollowUp: () => {},
    } as unknown as WriteContext;
    return { ctx: writeCtx, changes };
  }

  test("logs the real inventory id (not undefined) when UPDATE matches a row", async () => {
    const { ctx: writeCtx, changes } = mkWriteCtx({ updateRows: [{ id: "inv-1" }] });
    const res = await inventoryUpdateJobType.writeBatch(
      [coerced({ sku: "SKU-A", quantity_on_hand: 42 })],
      writeCtx,
    );
    expect(res.succeeded).toEqual(["inv-1"]);
    expect(changes).toHaveLength(1);
    expect(changes[0]!.entityId).toBe("inv-1");
  });

  test("falls back to INSERT when UPDATE matches no rows", async () => {
    const { ctx: writeCtx } = mkWriteCtx({ updateRows: [], insertRows: [{ id: "inv-new" }] });
    const res = await inventoryUpdateJobType.writeBatch(
      [coerced({ sku: "SKU-A", quantity_on_hand: 42 })],
      writeCtx,
    );
    expect(res.succeeded).toEqual(["inv-new"]);
  });
});
