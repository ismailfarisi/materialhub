import type {
  DeliveryZone,
  ShippingRate,
  Warehouse,
  WarehouseVendorPermission,
} from "@materialhub/database";
import { HttpError, NotFoundError } from "@materialhub/plugins";
// shipping.service.ts
import { In, type Repository } from "typeorm";
import {
  normaliseDeliverySettings,
  validateDeliverySettings,
} from "./estimate/delivery-estimate.service.ts";

// Must match inventory.service.ts / product.service.ts in product-service.
const WAREHOUSE_FULFILLMENT_PERMISSION = "fulfillment_origin";

export class ShippingService {
  constructor(
    private zoneRepo: Repository<DeliveryZone>,
    private rateRepo: Repository<ShippingRate>,
    private warehouseRepo: Repository<Warehouse>,
    private warehousePermissionRepo?: Repository<WarehouseVendorPermission>,
  ) {}

  async lookupZone(lat: number, lng: number): Promise<DeliveryZone> {
    const zone = await this.zoneRepo
      .createQueryBuilder("z")
      .where("z.is_active = true")
      .andWhere("ST_Contains(z.boundary, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326))", { lng, lat })
      .getOne();
    if (!zone) throw new NotFoundError("No delivery zone found for this location");
    return zone;
  }

  async getRatesForZone(zoneId: string | null, vendorId?: string): Promise<ShippingRate[]> {
    const conditions: any[] = [];
    if (zoneId) {
      conditions.push(
        { zone_id: zoneId, vendor_id: vendorId, is_active: true },
        { zone_id: zoneId, is_active: true },
      );
    }
    if (vendorId) {
      conditions.push({ vendor_id: vendorId, is_active: true });
    }
    conditions.push({ is_active: true }); // global default

    const rates = await this.rateRepo.find({
      where: conditions,
      order: { sort_order: "ASC" },
    });
    return rates;
  }

  calculateRate(rate: ShippingRate, orderSubtotal: number, totalWeightGrams: number): number {
    // Free shipping above threshold
    if (rate.free_above != null && orderSubtotal >= rate.free_above) return 0;

    const weightKg = totalWeightGrams / 1000;
    return rate.base_cost + Math.ceil(weightKg) * (rate.per_kg_cost || 0);
  }

  async calculateShipping(
    zoneId: string | null,
    vendorId: string,
    orderSubtotal: number,
    totalWeightGrams: number,
    method = "standard",
  ): Promise<{ cost: number; rate: ShippingRate }> {
    const rates = await this.getRatesForZone(zoneId, vendorId);
    const rate = rates.find((r) => r.method === method) || rates[0];
    if (!rate) throw new NotFoundError("No shipping rate available");
    const cost = this.calculateRate(rate, orderSubtotal, totalWeightGrams);
    return { cost, rate };
  }

  // --- Admin CRUD ---
  async listZones(): Promise<DeliveryZone[]> {
    return this.zoneRepo.find({ where: { is_active: true }, order: { sort_order: "ASC" } });
  }

  async createZone(data: Partial<DeliveryZone>): Promise<DeliveryZone> {
    return this.zoneRepo.save(data as any);
  }

  async createRate(data: Partial<ShippingRate>): Promise<ShippingRate> {
    return this.rateRepo.save(data as any);
  }

  async listWarehouses(
    vendorId?: string,
    opts?: { includeInactive?: boolean },
  ): Promise<Warehouse[]> {
    const where: any = {};
    if (!opts?.includeInactive) where.is_active = true;
    if (vendorId) where.vendor_id = vendorId;
    return this.warehouseRepo.find({
      where,
      order: { is_default: "DESC", created_at: "ASC" },
    });
  }

  /**
   * Warehouses a vendor can hold or move stock in: their own, plus platform /
   * shared warehouses granted via an active fulfillment_origin permission —
   * the same set inventory restock/adjust accepts (vendorCanUseWarehouse in
   * product-service). Inactive warehouses are included so stock rows that
   * point at them can still be named.
   */
  async listVendorWarehouses(vendorId: string): Promise<Warehouse[]> {
    const grants = this.warehousePermissionRepo
      ? await this.warehousePermissionRepo.find({
          where: {
            vendor_id: vendorId,
            permission: WAREHOUSE_FULFILLMENT_PERMISSION,
            is_active: true,
          },
        })
      : [];
    const where: any[] = [{ vendor_id: vendorId }];
    if (grants.length > 0) {
      where.push({ id: In(grants.map((g) => g.warehouse_id)) });
    }
    return this.warehouseRepo.find({
      where,
      order: { is_default: "DESC", created_at: "ASC" },
    });
  }

  async getWarehouse(id: string): Promise<Warehouse> {
    const wh = await this.warehouseRepo.findOne({ where: { id } as any });
    if (!wh) throw new NotFoundError("Warehouse not found");
    return wh;
  }

  /**
   * Create a warehouse. The first warehouse for a vendor is forced to be the
   * default; if `is_default` is requested, any existing default for that vendor
   * is unset in the same transaction.
   */
  async createWarehouse(data: Partial<Warehouse>): Promise<Warehouse> {
    return this.warehouseRepo.manager.transaction(async (m) => {
      const repo = m.getRepository(this.warehouseRepo.target);
      const existingCount = data.vendor_id
        ? await repo.count({ where: { vendor_id: data.vendor_id } as any })
        : 0;
      const makeDefault = Boolean(data.is_default) || existingCount === 0;
      if (makeDefault && data.vendor_id) {
        await repo.update({ vendor_id: data.vendor_id } as any, { is_default: false });
      }
      return repo.save({ ...data, is_default: makeDefault } as any);
    });
  }

  /**
   * Update mutable warehouse fields. `is_default` is intentionally ignored here
   * — use {@link setDefaultWarehouse} so the unset-others invariant holds.
   */
  async updateWarehouse(id: string, data: Partial<Warehouse>): Promise<Warehouse> {
    const wh = await this.getWarehouse(id);
    const { is_default: _d, vendor_id: _v, id: _id, ...mutable } = data as any;
    validateDeliverySettings(mutable);
    Object.assign(wh, normaliseDeliverySettings(mutable));
    return this.warehouseRepo.save(wh);
  }

  /** Promote a warehouse to default, unsetting the vendor's previous default. */
  async setDefaultWarehouse(id: string): Promise<Warehouse> {
    return this.warehouseRepo.manager.transaction(async (m) => {
      const repo = m.getRepository(this.warehouseRepo.target);
      const wh = await repo.findOne({ where: { id } as any });
      if (!wh) throw new NotFoundError("Warehouse not found");
      if (wh.vendor_id) {
        await repo.update({ vendor_id: wh.vendor_id } as any, { is_default: false });
      }
      wh.is_default = true;
      wh.is_active = true;
      return repo.save(wh);
    });
  }

  /** Soft-delete a warehouse. The default warehouse cannot be removed. */
  async deleteWarehouse(id: string): Promise<void> {
    const wh = await this.getWarehouse(id);
    if (wh.is_default) {
      throw new HttpError(
        422,
        "Cannot remove the default warehouse. Set another warehouse as default first.",
        "WAREHOUSE_IS_DEFAULT",
      );
    }
    await this.warehouseRepo.softRemove(wh);
  }
}
