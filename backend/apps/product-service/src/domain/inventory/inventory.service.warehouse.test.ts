/**
 * Warehouse resolution for restock/adjust.
 *
 * Both used to anchor on the vendor's *current* default warehouse, so a row
 * written against any other warehouse was invisible: restock silently forked a
 * second row, adjust threw 404 INVENTORY_NOT_FOUND on stock that plainly
 * existed.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

type Row = Record<string, any>;

let rows: Row[] = [];
let capturedWhere: any;
let defaultWarehouse: Row | null;

/** A TypeORM FindOperator for IS NULL, as produced by `IsNull()`. */
function isNullOperator(value: unknown): boolean {
  return typeof value === "object" && value !== null && (value as any)._type === "isNull";
}

/**
 * Honour the where clause the way Postgres would, so a lookup pinned to the
 * wrong warehouse genuinely misses. A fake that ignores `where` would pass
 * against the very bug these tests exist to catch.
 */
function matches(rowValue: unknown, condition: unknown): boolean {
  if (condition === undefined) return true; // TypeORM drops undefined conditions
  if (isNullOperator(condition)) return rowValue === null || rowValue === undefined;
  return rowValue === condition;
}

function applyWhere(where: any): Row[] {
  return rows.filter((r) =>
    Object.entries(where ?? {}).every(([key, condition]) => matches(r[key], condition)),
  );
}

const inventoryRepo = {
  find: async (opts: any) => {
    capturedWhere = opts.where;
    return applyWhere(opts.where);
  },
  findOne: async (opts: any) => {
    capturedWhere = opts.where;
    return applyWhere(opts.where)[0] ?? null;
  },
};

const fakeManager = {
  create: (_e: unknown, row: Row) => ({ id: "new-row", ...row }),
  save: async (_e: unknown, row: Row) => row,
  getRepository: (entity: unknown) => {
    const name = typeof entity === "string" ? entity : (entity as any)?.name;
    if (name === "Warehouse") return { findOne: async () => defaultWarehouse };
    if (name === "WarehouseVendorPermission") return { findOne: async () => null };
    return inventoryRepo;
  },
};

mock.module("@materialhub/database", () => ({
  AppDataSource: {
    getRepository: () => inventoryRepo,
    transaction: async (fn: (m: unknown) => unknown) => fn(fakeManager),
  },
  Inventory: class Inventory {},
  Product: class Product {},
  InventoryMovement: class InventoryMovement {},
  Warehouse: class Warehouse {},
  WarehouseVendorPermission: class WarehouseVendorPermission {},
}));

mock.module("@materialhub/plugins", () => ({
  HttpError: class HttpError extends Error {
    constructor(
      public status: number,
      public override message: string,
      public code: string,
    ) {
      super(message);
    }
  },
}));

// enqueueSearchSync opens a BullMQ/Redis connection at call time; this is a
// mocked-repo unit test with no Redis, so the real module hangs the suite.
// Spread the real module so other exports (SearchSyncProcessor, used by
// search-sync.job.test.ts in the same bun process) survive the mock.
const realSearchSync = await import("../search/search-sync.job.ts");
const searchSyncs: any[] = [];
mock.module("../search/search-sync.job.ts", () => ({
  ...realSearchSync,
  enqueueSearchSync: async (job: any) => {
    // Stands in for a Redis outage, so the best-effort contract is exercised
    // rather than assumed.
    if (job.productId === "product-enqueue-fails") throw new Error("redis down");
    searchSyncs.push(job);
  },
}));

const { InventoryService } = await import("./inventory.service.ts");

function makeService() {
  return Object.create(InventoryService.prototype) as any;
}

function row(overrides: Row = {}): Row {
  return {
    id: "inv-1",
    product_id: "product-1",
    variant_id: null,
    vendor_id: "vendor-1",
    warehouse_id: "wh-orphan",
    quantity_on_hand: 73,
    quantity_reserved: 0,
    ...overrides,
  };
}

describe("InventoryService warehouse resolution", () => {
  beforeEach(() => {
    rows = [];
    capturedWhere = undefined;
    searchSyncs.length = 0;
    defaultWarehouse = { id: "wh-default", vendor_id: "vendor-1" };
  });

  test("adjust finds the sole row even in a non-default warehouse", async () => {
    rows = [row()];

    const result = await makeService().adjust("vendor-1", {
      product_id: "product-1",
      quantity: -13,
      reason: "stock count",
    });

    expect(result.quantity_on_hand).toBe(60);
  });

  test("restock updates the sole row rather than forking a duplicate", async () => {
    rows = [row({ quantity_on_hand: 73 })];

    const result = await makeService().restock("vendor-1", {
      product_id: "product-1",
      quantity: 2,
    });

    expect(result.id).toBe("inv-1");
    expect(result.quantity_on_hand).toBe(75);
  });

  test("restock creates a row in the default warehouse when none exists", async () => {
    rows = [];

    const result = await makeService().restock("vendor-1", {
      product_id: "product-1",
      quantity: 5,
    });

    expect(result.warehouse_id).toBe("wh-default");
    expect(result.quantity_on_hand).toBe(5);
  });

  test("adjust 404s when the product has no inventory at all", async () => {
    rows = [];

    await expect(
      makeService().adjust("vendor-1", { product_id: "product-1", quantity: -1, reason: "x" }),
    ).rejects.toMatchObject({ code: "INVENTORY_NOT_FOUND" });
  });

  test("409s when stock spans several warehouses and none is named", async () => {
    rows = [row({ id: "inv-1", warehouse_id: "wh-a" }), row({ id: "inv-2", warehouse_id: "wh-b" })];

    await expect(
      makeService().adjust("vendor-1", { product_id: "product-1", quantity: -1, reason: "x" }),
    ).rejects.toMatchObject({ code: "AMBIGUOUS_WAREHOUSE" });
  });

  test("a product-level lookup constrains variant_id to NULL, not undefined", async () => {
    rows = [row()];

    await makeService().adjust("vendor-1", {
      product_id: "product-1",
      quantity: -1,
      reason: "x",
    });

    // `undefined` is dropped from a TypeORM where clause, letting a
    // product-level lookup match a variant's row.
    expect(capturedWhere.variant_id).toBeDefined();
  });

  /**
   * Typesense's `in_stock` is computed at index time and listings now default
   * to inStock=true, so a stock write that skips the re-index leaves a
   * restocked product invisible on every listing until the nightly reindex.
   */
  test("restock and adjust re-index the product for search", async () => {
    rows = [row()];
    await makeService().adjust("vendor-1", {
      product_id: "product-1",
      quantity: -1,
      reason: "x",
    });
    await makeService().restock("vendor-1", { product_id: "product-1", quantity: 4 });

    expect(searchSyncs).toEqual([
      { type: "upsert_by_product_id", productId: "product-1" },
      { type: "upsert_by_product_id", productId: "product-1" },
    ]);
  });

  test("a failed search enqueue does not fail the committed stock write", async () => {
    rows = [row({ product_id: "product-enqueue-fails", quantity_on_hand: 10 })];

    // The row is already committed by the time the enqueue runs; a Redis
    // outage must not turn a successful adjustment into a 500.
    const result = await makeService().adjust("vendor-1", {
      product_id: "product-enqueue-fails",
      quantity: -3,
      reason: "x",
    });

    expect(result.quantity_on_hand).toBe(7);
    expect(searchSyncs).toEqual([]);
  });

  test("an explicit warehouse still honours vendorCanUseWarehouse", async () => {
    rows = [row()];
    defaultWarehouse = null; // no vendor-owned warehouse, no grant

    await expect(
      makeService().adjust("vendor-1", {
        product_id: "product-1",
        warehouse_id: "wh-someone-elses",
        quantity: -1,
        reason: "x",
      }),
    ).rejects.toMatchObject({ code: "WAREHOUSE_NOT_AVAILABLE" });
  });
});
