import { describe, expect, test } from "bun:test";
import type { EntityManager } from "typeorm";
import { seedSimpleProductInventory } from "../catalog-import.inventory.ts";

type Call = { sql: string; params: unknown[] };

function fakeManager(existingRows: unknown[]) {
  const calls: Call[] = [];
  const manager = {
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      return sql.trimStart().startsWith("SELECT") ? existingRows : [];
    },
  } as unknown as EntityManager;
  return { manager, calls };
}

const args = {
  productId: "product-1",
  vendorId: "vendor-1",
  warehouseId: "warehouse-1",
  quantity: 10,
};

describe("seedSimpleProductInventory", () => {
  test("inserts opening stock when the product has no inventory row", async () => {
    const { manager, calls } = fakeManager([]);

    const result = await seedSimpleProductInventory(manager, args);

    expect(result).toBe("inserted");
    const insert = calls.find((c) => c.sql.includes("INSERT INTO inventory"));
    expect(insert).toBeDefined();
    expect(insert!.params).toEqual(["product-1", "vendor-1", "warehouse-1", 10]);
  });

  test("seeds quantity_available so the row is not born inconsistent", async () => {
    const { manager, calls } = fakeManager([]);

    await seedSimpleProductInventory(manager, args);

    const insert = calls.find((c) => c.sql.includes("INSERT INTO inventory"))!;
    expect(insert.sql).toContain("quantity_available");
  });

  test("does not insert a second row when one already exists", async () => {
    const { manager, calls } = fakeManager([{ id: "inventory-1" }]);

    const result = await seedSimpleProductInventory(manager, args);

    expect(result).toBe("skipped");
    expect(calls.some((c) => c.sql.includes("INSERT INTO inventory"))).toBe(false);
  });

  test("never relies on a bare ON CONFLICT DO NOTHING", async () => {
    const { manager, calls } = fakeManager([]);

    await seedSimpleProductInventory(manager, args);

    // `inventory` has no unique constraint on (product_id, variant_id,
    // warehouse_id), so a targetless ON CONFLICT silently duplicates.
    expect(calls.every((c) => !c.sql.includes("ON CONFLICT DO NOTHING"))).toBe(true);
  });

  test("scopes the existence check to live rows of this product and warehouse", async () => {
    const { manager, calls } = fakeManager([]);

    await seedSimpleProductInventory(manager, args);

    const select = calls.find((c) => c.sql.trimStart().startsWith("SELECT"))!;
    expect(select.sql).toContain("variant_id IS NULL");
    expect(select.sql).toContain("deleted_at IS NULL");
    expect(select.params).toEqual(["product-1", "warehouse-1"]);
  });
});
