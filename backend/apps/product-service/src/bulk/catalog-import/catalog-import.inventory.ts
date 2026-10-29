import type { EntityManager } from "typeorm";

export interface SeedInventoryArgs {
  productId: string;
  vendorId: string;
  warehouseId: string;
  quantity: number;
}

/**
 * Seed a simple product's opening stock on first import, and never again.
 *
 * The previous implementation relied on `INSERT ... ON CONFLICT DO NOTHING`
 * with no conflict target. `inventory` has no unique constraint on
 * (product_id, variant_id, warehouse_id), so nothing ever conflicted and every
 * re-import appended another row — 4,222 duplicate groups on production, none
 * of them carrying any inventory_movements.
 *
 * Re-importing must not clobber stock a vendor has since restocked or adjusted,
 * so an existing row is left exactly as it is.
 */
export async function seedSimpleProductInventory(
  manager: EntityManager,
  { productId, vendorId, warehouseId, quantity }: SeedInventoryArgs,
): Promise<"inserted" | "skipped"> {
  const existing = await manager.query(
    `SELECT id FROM inventory
      WHERE product_id = $1 AND variant_id IS NULL AND warehouse_id = $2
        AND deleted_at IS NULL
      LIMIT 1`,
    [productId, warehouseId],
  );
  if (existing.length > 0) return "skipped";

  await manager.query(
    `INSERT INTO inventory
       (product_id, vendor_id, warehouse_id, quantity_on_hand, quantity_reserved,
        quantity_available, low_stock_threshold)
     VALUES ($1, $2, $3, $4, 0, $4, 0)`,
    [productId, vendorId, warehouseId, quantity],
  );
  return "inserted";
}
