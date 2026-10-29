import {
  type BatchResult,
  BulkErrorCodes,
  type JobType,
  type ParsedRow,
  type RowError,
  type ValidationContextBase,
  type WriteContext,
} from "@materialhub/bulk-jobs";
import { BulkJobStrictness, Inventory, Warehouse } from "@materialhub/database";
import type { EntityManager } from "typeorm";
import { type ResolvedKey, buildSkuResolverMaps } from "../shared/sku-resolver.ts";
import { type InventoryUpdateRow, InventoryUpdateRowSchema } from "./inventory-update.schema.ts";
import { inventoryUpdateTemplate } from "./inventory-update.template.ts";

export interface InventoryUpdateCtx extends ValidationContextBase {
  vendorId: string;
  defaultWarehouseId: string;
  bySku: Map<string, ResolvedKey>;
  byExternalId: Map<string, ResolvedKey>;
  duplicateSkus: Set<string>;
  /** warehouseId|productId|variantId → quantity_on_hand; variantId empty string means NULL */
  currentQuantities: Map<string, number>;
}

function keyFor(warehouseId: string, productId: string, variantId: string | null): string {
  return `${warehouseId}|${productId}|${variantId ?? ""}`;
}

export const inventoryUpdateJobType: JobType<InventoryUpdateRow, string, InventoryUpdateCtx> = {
  key: "inventory_update",
  defaultStrictness: BulkJobStrictness.AllOrNothing,
  template: inventoryUpdateTemplate,
  parseOptions: {
    expectedSheets: ["Inventory"],
    requiredColumnsPerSheet: { Inventory: ["quantity_on_hand"], "": ["quantity_on_hand"] },
  },
  rowSchema: InventoryUpdateRowSchema,

  async buildValidationContext({ dataSource, vendorId }) {
    if (!vendorId) throw new Error("inventory_update requires a vendor");
    const warehouseRow = await dataSource
      .getRepository(Warehouse)
      .createQueryBuilder("w")
      .where("w.vendor_id = :v", { v: vendorId })
      .andWhere("w.is_default = true")
      .andWhere("w.is_active = true")
      .andWhere("w.deleted_at IS NULL")
      .getOne();
    if (!warehouseRow) {
      const err: Error & { code?: string } = new Error("no_default_warehouse");
      err.code = BulkErrorCodes.NO_DEFAULT_WAREHOUSE;
      throw err;
    }

    const maps = await buildSkuResolverMaps(dataSource, vendorId);

    const invRows = await dataSource
      .getRepository(Inventory)
      .createQueryBuilder("i")
      .where("i.warehouse_id = :w", { w: warehouseRow.id })
      .getMany();
    const currentQuantities = new Map<string, number>();
    for (const r of invRows) {
      currentQuantities.set(
        keyFor(warehouseRow.id, r.product_id, r.variant_id),
        r.quantity_on_hand,
      );
    }

    return {
      vendorId,
      defaultWarehouseId: warehouseRow.id,
      bySku: maps.bySku,
      byExternalId: maps.byExternalId,
      duplicateSkus: maps.duplicateSkus,
      currentQuantities,
    };
  },

  coerceRow(row: ParsedRow, _ctx) {
    const errors: RowError[] = [];
    const sku = (row.values.sku ?? "").trim() || null;
    const external_id = (row.values.external_id ?? "").trim() || null;
    const qtyStr = (row.values.quantity_on_hand ?? "").trim();
    const note = (row.values.note ?? "").trim() || null;

    if (!sku && !external_id) {
      errors.push({
        rowNumber: row.rowNumber,
        sheetName: row.sheetName,
        errorCode: BulkErrorCodes.MISSING_REQUIRED_FIELD,
        errorMessage: "either sku or external_id is required",
        field: "sku",
        rowSnapshot: { ...row.values },
      });
    }
    const qty = Number.parseInt(qtyStr, 10);
    if (qtyStr === "" || Number.isNaN(qty)) {
      errors.push({
        rowNumber: row.rowNumber,
        sheetName: row.sheetName,
        errorCode: BulkErrorCodes.MISSING_REQUIRED_FIELD,
        errorMessage: "quantity_on_hand is required and must be an integer",
        field: "quantity_on_hand",
        rowSnapshot: { ...row.values },
      });
    } else if (qty < 0) {
      errors.push({
        rowNumber: row.rowNumber,
        sheetName: row.sheetName,
        errorCode: BulkErrorCodes.NEGATIVE_QUANTITY,
        errorMessage: "quantity_on_hand must be >= 0",
        field: "quantity_on_hand",
        rowSnapshot: { ...row.values },
      });
    } else if (qty > 10_000_000) {
      errors.push({
        rowNumber: row.rowNumber,
        sheetName: row.sheetName,
        errorCode: BulkErrorCodes.QUANTITY_TOO_LARGE,
        errorMessage: "quantity_on_hand exceeds sanity cap",
        field: "quantity_on_hand",
        rowSnapshot: { ...row.values },
      });
    }

    if (errors.length > 0) return { ok: false, errors };
    return {
      ok: true,
      value: { sku, external_id, quantity_on_hand: qty, note, rowNumber: row.rowNumber },
    };
  },

  preValidate(rows, ctx) {
    const errors: RowError[] = [];
    for (const row of rows) {
      const r: ParsedRow = row;
      const external_id = (r.values.external_id ?? "").trim() || null;
      const sku = (r.values.sku ?? "").trim() || null;

      const resolved =
        (external_id && ctx.byExternalId.get(external_id)) || (sku && ctx.bySku.get(sku));

      if (!resolved) {
        errors.push({
          rowNumber: r.rowNumber,
          sheetName: r.sheetName,
          errorCode: BulkErrorCodes.UNKNOWN_PRODUCT,
          errorMessage: `no product or variant matches sku="${sku ?? ""}" / external_id="${external_id ?? ""}"`,
          field: external_id ? "external_id" : "sku",
          rowSnapshot: { ...r.values },
        });
        continue;
      }
      if (resolved.deleted) {
        errors.push({
          rowNumber: r.rowNumber,
          sheetName: r.sheetName,
          errorCode: BulkErrorCodes.SOFT_DELETED,
          errorMessage: "target product is soft-deleted",
          field: external_id ? "external_id" : "sku",
          rowSnapshot: { ...r.values },
        });
        continue;
      }
      if (sku && ctx.duplicateSkus.has(sku)) {
        errors.push({
          rowNumber: r.rowNumber,
          sheetName: r.sheetName,
          errorCode: BulkErrorCodes.AMBIGUOUS_PRODUCT,
          errorMessage: `sku "${sku}" matches multiple rows in your catalog; use external_id instead`,
          field: "sku",
          rowSnapshot: { ...r.values },
        });
        continue;
      }
      if (resolved.hasVariants && !resolved.variantId) {
        errors.push({
          rowNumber: r.rowNumber,
          sheetName: r.sheetName,
          errorCode: BulkErrorCodes.HAS_VARIANTS_BUT_NO_VARIANT_KEY,
          errorMessage: "target product has variants — specify the variant sku/external_id instead",
          field: external_id ? "external_id" : "sku",
          rowSnapshot: { ...r.values },
        });
      }
    }
    return errors;
  },

  async writeBatch(rows, ctx: WriteContext): Promise<BatchResult<string>> {
    const succeeded: string[] = [];
    const skipped: Array<{ rowNumber: number; reason: string }> = [];

    const vCtx = ctx.job.summary?.context as InventoryUpdateCtx | undefined;
    if (!vCtx) {
      for (const r of rows) skipped.push({ rowNumber: r.rowNumber, reason: "no_context" });
      return { succeeded, skipped };
    }

    const manager: EntityManager = ctx.manager;

    for (const row of rows) {
      const resolved =
        (row.external_id && vCtx.byExternalId.get(row.external_id)) ||
        (row.sku && vCtx.bySku.get(row.sku));
      if (!resolved) {
        skipped.push({ rowNumber: row.rowNumber, reason: "unresolved_in_batch" });
        continue;
      }

      const key = keyFor(vCtx.defaultWarehouseId, resolved.productId, resolved.variantId);
      const oldQty = vCtx.currentQuantities.get(key);

      // TypeORM 0.3.28's manager.query() returns `[rows, rowCount]` for UPDATE/DELETE
      // (unlike SELECT/INSERT, which return a flat rows array). Destructure the rows
      // array — reading `result[0].id` directly gives the rows array, so `.id` is
      // undefined and blows up the diff log's NOT NULL entity_id column.
      const [updatedRows] = (await manager.query(
        `UPDATE inventory
         SET quantity_on_hand = $1,
             quantity_available = $1 - quantity_reserved,
             last_restocked_at = now(), updated_at = now()
         WHERE product_id = $2
           AND warehouse_id = $3
           AND variant_id IS NOT DISTINCT FROM $4
           AND deleted_at IS NULL
         RETURNING id`,
        [row.quantity_on_hand, resolved.productId, vCtx.defaultWarehouseId, resolved.variantId],
      )) as [Array<{ id: string }>, number];

      let entityId: string;
      if (updatedRows.length === 0) {
        const inserted = await manager.query(
          `INSERT INTO inventory
            (product_id, variant_id, vendor_id, warehouse_id, quantity_on_hand, quantity_reserved, quantity_available, low_stock_threshold)
           VALUES ($1, $2, $3, $4, $5, 0, $5, 0)
           RETURNING id`,
          [
            resolved.productId,
            resolved.variantId,
            vCtx.vendorId,
            vCtx.defaultWarehouseId,
            row.quantity_on_hand,
          ],
        );
        entityId = inserted[0].id;
      } else {
        entityId = updatedRows[0]!.id;
      }

      if (oldQty != null && oldQty !== row.quantity_on_hand) {
        ctx.logChange({
          rowNumber: row.rowNumber,
          entityType: "inventory",
          entityId,
          field: "quantity_on_hand",
          oldValue: oldQty,
          newValue: row.quantity_on_hand,
        });
      }

      succeeded.push(entityId);
    }

    return { succeeded, skipped };
  },

  async postComplete(ctx: WriteContext) {
    const rows = await ctx.manager.query(
      `SELECT DISTINCT entity_id FROM bulk_import_job_row_changes WHERE job_id = $1 AND entity_type = 'inventory'`,
      [ctx.job.id],
    );
    const inventoryIds: string[] = rows.map((r: { entity_id: string }) => r.entity_id);
    if (inventoryIds.length === 0) return;

    const productRows = await ctx.manager.query(
      "SELECT DISTINCT product_id FROM inventory WHERE id = ANY($1::uuid[])",
      [inventoryIds],
    );
    const productIds: string[] = productRows.map((r: { product_id: string }) => r.product_id);

    for (const productId of productIds) {
      ctx.pushFollowUp({ queue: "search-reindex", payload: { productId } });
      ctx.pushFollowUp({ queue: "product-cache-invalidate", payload: { productId } });
    }
  },
};
