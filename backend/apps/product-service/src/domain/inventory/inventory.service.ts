import {
  AppDataSource,
  Inventory,
  InventoryMovement,
  Warehouse,
  WarehouseVendorPermission,
} from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";
import { type EntityManager, IsNull } from "typeorm";
import { enqueueSearchSync } from "../search/search-sync.job.ts";

const WAREHOUSE_FULFILLMENT_PERMISSION = "fulfillment_origin";

export class InventoryService {
  private get repo() {
    return AppDataSource.getRepository(Inventory);
  }
  private get movementRepo() {
    return AppDataSource.getRepository(InventoryMovement);
  }

  private async vendorCanUseWarehouse(
    manager: EntityManager,
    warehouseId: string,
    vendorId: string,
  ): Promise<boolean> {
    const wh = await manager.getRepository(Warehouse).findOne({
      where: { id: warehouseId, is_active: true },
    });
    if (!wh) return false;
    if (wh.vendor_id === vendorId) return true;
    const grant = await manager.getRepository(WarehouseVendorPermission).findOne({
      where: {
        warehouse_id: warehouseId,
        vendor_id: vendorId,
        permission: WAREHOUSE_FULFILLMENT_PERMISSION,
        is_active: true,
      },
    });
    return Boolean(grant);
  }

  private async resolveWarehouseId(
    manager: EntityManager,
    vendorId: string,
    explicitWarehouseId?: string,
  ): Promise<string | null> {
    if (explicitWarehouseId) {
      if (!(await this.vendorCanUseWarehouse(manager, explicitWarehouseId, vendorId))) {
        throw new HttpError(
          422,
          "Warehouse not available for this vendor",
          "WAREHOUSE_NOT_AVAILABLE",
        );
      }
      return explicitWarehouseId;
    }
    const defaultWarehouse = await manager.getRepository(Warehouse).findOne({
      where: { vendor_id: vendorId, is_default: true, is_active: true },
    });
    return defaultWarehouse?.id ?? null;
  }

  /**
   * Locate the inventory row a restock/adjust should act on.
   *
   * An explicit warehouse is honoured exactly. When the caller names none — the
   * vendor product form historically didn't — the product's single existing row
   * wins, whatever warehouse holds it. Anchoring instead on the vendor's
   * *current* default warehouse made rows written against any other warehouse
   * invisible: restock silently forked a second row, adjust threw 404.
   */
  private async findInventoryRow(
    manager: EntityManager,
    vendorId: string,
    data: { product_id: string; variant_id?: string; warehouse_id?: string },
  ): Promise<{ inventory: Inventory | null; warehouseId: string | null }> {
    const repo = manager.getRepository(Inventory);
    // `undefined` is dropped from a TypeORM where clause; IsNull() is the
    // product-level (no variant) condition we actually mean.
    const variantCondition = data.variant_id ?? IsNull();

    if (data.warehouse_id) {
      const warehouseId = await this.resolveWarehouseId(manager, vendorId, data.warehouse_id);
      const inventory = await repo.findOne({
        where: {
          product_id: data.product_id,
          variant_id: variantCondition,
          vendor_id: vendorId,
          warehouse_id: warehouseId ?? IsNull(),
        },
        lock: { mode: "pessimistic_write" },
      });
      return { inventory, warehouseId };
    }

    const matches = await repo.find({
      where: {
        product_id: data.product_id,
        variant_id: variantCondition,
        vendor_id: vendorId,
      },
      lock: { mode: "pessimistic_write" },
    });

    if (matches.length === 1) {
      const only = matches[0]!;
      return { inventory: only, warehouseId: only.warehouse_id };
    }
    if (matches.length > 1) {
      throw new HttpError(
        409,
        "This product holds stock in several warehouses — specify warehouse_id",
        "AMBIGUOUS_WAREHOUSE",
      );
    }
    return { inventory: null, warehouseId: await this.resolveWarehouseId(manager, vendorId) };
  }

  /**
   * The Typesense `in_stock` flag is computed at index time from the product's
   * inventoryRecords, and listings now default to `inStock=true` — so a stock
   * write that doesn't re-index leaves a restocked product invisible on every
   * listing until an unrelated product edit or the nightly reindex.
   *
   * Enqueued AFTER the transaction commits, and best-effort: the stock write is
   * already durable, so a Redis outage must not turn a successful adjustment
   * into a 500. The nightly reindex is the backstop.
   */
  private async enqueueStockSync(productId: string): Promise<void> {
    try {
      await enqueueSearchSync({ type: "upsert_by_product_id", productId });
    } catch (err) {
      console.error("[inventory] search sync enqueue failed", { productId, err });
    }
  }

  async restock(
    vendorId: string,
    data: {
      product_id: string;
      variant_id?: string;
      warehouse_id?: string;
      quantity: number;
    },
  ) {
    const result = await AppDataSource.transaction(async (manager) => {
      const { inventory: found, warehouseId } = await this.findInventoryRow(
        manager,
        vendorId,
        data,
      );
      let inventory = found;

      if (!inventory) {
        inventory = manager.create(Inventory, {
          product_id: data.product_id,
          variant_id: data.variant_id ?? null,
          vendor_id: vendorId,
          warehouse_id: warehouseId,
          quantity_on_hand: 0,
          quantity_reserved: 0,
          low_stock_threshold: 10,
        });
      }

      const before = inventory.quantity_on_hand;
      inventory.quantity_on_hand += data.quantity;
      inventory.quantity_available = inventory.quantity_on_hand - inventory.quantity_reserved;
      inventory.last_restocked_at = new Date();
      inventory = await manager.save(Inventory, inventory);

      await manager.save(
        InventoryMovement,
        manager.create(InventoryMovement, {
          inventory_id: inventory.id,
          product_id: data.product_id,
          variant_id: data.variant_id ?? null,
          quantity: data.quantity,
          quantity_before: before,
          quantity_after: inventory.quantity_on_hand,
          movement_type: "restock" as any,
        }),
      );

      return inventory;
    });
    await this.enqueueStockSync(data.product_id);
    return result;
  }

  async adjust(
    vendorId: string,
    data: {
      product_id: string;
      variant_id?: string;
      warehouse_id?: string;
      quantity: number; // Can be negative
      reason: string;
    },
  ) {
    const result = await AppDataSource.transaction(async (manager) => {
      const { inventory } = await this.findInventoryRow(manager, vendorId, data);

      if (!inventory) throw new HttpError(404, "Inventory record not found", "INVENTORY_NOT_FOUND");

      const before = inventory.quantity_on_hand;
      inventory.quantity_on_hand += data.quantity;
      if (inventory.quantity_on_hand < 0) {
        throw new HttpError(422, "Adjustment would result in negative stock", "NEGATIVE_STOCK");
      }
      inventory.quantity_available = inventory.quantity_on_hand - inventory.quantity_reserved;

      await manager.save(Inventory, inventory);

      await manager.save(
        InventoryMovement,
        manager.create(InventoryMovement, {
          inventory_id: inventory.id,
          product_id: data.product_id,
          variant_id: data.variant_id ?? null,
          quantity: data.quantity,
          quantity_before: before,
          quantity_after: inventory.quantity_on_hand,
          movement_type: "adjustment" as any,
          notes: data.reason,
        }),
      );

      return inventory;
    });
    await this.enqueueStockSync(data.product_id);
    return result;
  }

  async adjustIdempotent(input: {
    vendor_id: string;
    product_id: string;
    variant_id?: string;
    delta: number;
    change_id: string;
    reason: string;
  }): Promise<{ applied: boolean; new_quantity: number }> {
    const existing = await this.movementRepo.findOne({
      where: { external_change_id: input.change_id, product_id: input.product_id } as any,
    });
    if (existing) {
      const inv = await this.repo.findOne({
        where: {
          product_id: input.product_id,
          variant_id: input.variant_id ?? IsNull(),
          vendor_id: input.vendor_id,
        } as any,
      });
      return { applied: false, new_quantity: inv?.quantity_on_hand ?? 0 };
    }

    const result = await AppDataSource.transaction(async (manager) => {
      const inventory = await manager.getRepository(Inventory).findOne({
        where: {
          product_id: input.product_id,
          variant_id: input.variant_id ?? IsNull(),
          vendor_id: input.vendor_id,
        },
        lock: { mode: "pessimistic_write" },
      });
      if (!inventory) {
        throw new HttpError(404, "Inventory record not found", "INVENTORY_NOT_FOUND");
      }
      const before = inventory.quantity_on_hand;
      inventory.quantity_on_hand += input.delta;
      if (inventory.quantity_on_hand < 0) {
        throw new HttpError(422, "Adjustment would result in negative stock", "NEGATIVE_STOCK");
      }
      inventory.quantity_available = inventory.quantity_on_hand - inventory.quantity_reserved;
      await manager.save(Inventory, inventory);

      await manager.save(
        InventoryMovement,
        manager.create(InventoryMovement, {
          inventory_id: inventory.id,
          product_id: input.product_id,
          variant_id: input.variant_id ?? null,
          quantity: input.delta,
          quantity_before: before,
          quantity_after: inventory.quantity_on_hand,
          movement_type: "adjustment" as any,
          notes: input.reason,
          external_change_id: input.change_id,
        }),
      );

      return { applied: true, new_quantity: inventory.quantity_on_hand };
    });
    await this.enqueueStockSync(input.product_id);
    return result;
  }

  async listForVendor(vendorId: string, productId?: string) {
    const qb = this.repo.createQueryBuilder("i").where("i.vendor_id = :vendorId", { vendorId });
    if (productId) qb.andWhere("i.product_id = :productId", { productId });
    return qb.orderBy("i.product_id", "ASC").getMany();
  }

  async getMovements(vendorId: string, productId?: string, page = 1, limit = 50) {
    const qb = this.movementRepo
      .createQueryBuilder("m")
      .innerJoin("m.inventory", "i")
      .where("i.vendor_id = :vendorId", { vendorId });
    if (productId) qb.andWhere("m.product_id = :productId", { productId });
    qb.orderBy("m.created_at", "DESC")
      .skip((page - 1) * limit)
      .take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async getLowStock(vendorId: string) {
    return this.repo
      .createQueryBuilder("i")
      .where("i.vendor_id = :vendorId", { vendorId })
      .andWhere("i.quantity_on_hand - i.quantity_reserved <= i.low_stock_threshold")
      .orderBy("i.quantity_on_hand - i.quantity_reserved", "ASC")
      .getMany();
  }
}
