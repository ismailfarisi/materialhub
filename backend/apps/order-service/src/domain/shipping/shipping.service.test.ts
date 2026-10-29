// shipping.service.test.ts
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { ShippingService } from "./shipping.service.ts";

describe("ShippingService", () => {
  const mockZoneRepo = {
    findOne: mock(() => Promise.resolve(null)),
    find: mock(() => Promise.resolve([])),
    save: mock((z: any) => Promise.resolve({ id: "z1", ...z })),
    softRemove: mock(() => Promise.resolve()),
    createQueryBuilder: mock(() => ({
      where: mock().mockReturnThis(),
      andWhere: mock().mockReturnThis(),
      getOne: mock(() => Promise.resolve({ id: "z1", name: "Dubai" })),
    })),
  };
  const mockRateRepo = {
    find: mock(() => Promise.resolve([])),
    findOne: mock(() => Promise.resolve(null)),
    save: mock((r: any) => Promise.resolve({ id: "r1", ...r })),
    softRemove: mock(() => Promise.resolve()),
  };
  const mockWarehouseRepo: any = {
    target: "Warehouse",
    find: mock(() => Promise.resolve([])),
    findOne: mock(() => Promise.resolve(null)),
    save: mock((w: any) => Promise.resolve({ id: "w1", ...w })),
    softRemove: mock(() => Promise.resolve()),
    count: mock(() => Promise.resolve(0)),
    update: mock(() => Promise.resolve({})),
    // transaction runs the callback with a manager whose getRepository returns
    // this same mock, so assertions can inspect count/update/save calls.
    manager: {
      transaction: mock((cb: any) => cb({ getRepository: () => mockWarehouseRepo })),
    },
  };

  const mockPermissionRepo: any = {
    find: mock(() => Promise.resolve([])),
  };

  let service: ShippingService;

  beforeEach(() => {
    Object.values(mockZoneRepo).forEach((m) => typeof m === "function" && m.mockClear?.());
    Object.values(mockRateRepo).forEach((m) => m.mockClear());
    Object.values(mockWarehouseRepo).forEach(
      (m: any) => typeof m === "function" && m.mockClear?.(),
    );
    mockWarehouseRepo.manager.transaction.mockClear();
    mockPermissionRepo.find.mockClear();
    service = new ShippingService(
      mockZoneRepo as any,
      mockRateRepo as any,
      mockWarehouseRepo as any,
      mockPermissionRepo as any,
    );
  });

  it("calculates shipping cost with base + per-kg", () => {
    const rate = { base_cost: 1500, per_kg_cost: 200, free_above: 20000 };
    const cost = service.calculateRate(rate as any, 3000, 5000);
    // base 1500 + (5kg * 200) = 2500
    expect(cost).toBe(2500);
  });

  it("returns 0 when order exceeds free_above threshold", () => {
    const rate = { base_cost: 1500, per_kg_cost: 200, free_above: 20000 };
    const cost = service.calculateRate(rate as any, 25000, 5000);
    expect(cost).toBe(0);
  });

  it("uses base_cost only when weight is 0", () => {
    const rate = { base_cost: 1500, per_kg_cost: 200, free_above: null };
    const cost = service.calculateRate(rate as any, 5000, 0);
    expect(cost).toBe(1500);
  });

  describe("listVendorWarehouses", () => {
    // The vendor dropdown must offer every warehouse restock/adjust accepts:
    // owned ones plus platform/shared ones held via an active
    // fulfillment_origin grant (see inventory.service.ts vendorCanUseWarehouse).
    it("returns owned and fulfillment-granted warehouses", async () => {
      mockPermissionRepo.find.mockResolvedValueOnce([
        { warehouse_id: "wh-platform", vendor_id: "v1" },
      ]);
      const owned = { id: "wh-own", vendor_id: "v1", name: "Own" };
      const granted = { id: "wh-platform", vendor_id: null, name: "Hub" };
      mockWarehouseRepo.find.mockResolvedValueOnce([granted, owned]);

      const result = await service.listVendorWarehouses("v1");

      expect(mockPermissionRepo.find).toHaveBeenCalledWith({
        where: { vendor_id: "v1", permission: "fulfillment_origin", is_active: true },
      });
      const where = mockWarehouseRepo.find.mock.calls[0][0].where;
      expect(where).toHaveLength(2);
      expect(where[0]).toEqual({ vendor_id: "v1" });
      expect(result).toEqual([granted, owned] as any);
    });

    it("queries only owned warehouses when the vendor has no grants", async () => {
      mockPermissionRepo.find.mockResolvedValueOnce([]);
      await service.listVendorWarehouses("v1");
      const where = mockWarehouseRepo.find.mock.calls[0][0].where;
      expect(where).toEqual([{ vendor_id: "v1" }]);
    });
  });

  describe("warehouse CRUD", () => {
    it("forces is_default=true for a vendor's first warehouse", async () => {
      mockWarehouseRepo.count.mockResolvedValueOnce(0);
      const wh = await service.createWarehouse({ vendor_id: "v1", name: "WH1" } as any);
      expect(wh.is_default).toBe(true);
    });

    it("unsets prior default when creating a new default warehouse", async () => {
      mockWarehouseRepo.count.mockResolvedValueOnce(2);
      await service.createWarehouse({ vendor_id: "v1", name: "WH2", is_default: true } as any);
      expect(mockWarehouseRepo.update).toHaveBeenCalledWith(
        { vendor_id: "v1" },
        { is_default: false },
      );
    });

    it("does not force default for a non-first, non-default warehouse", async () => {
      mockWarehouseRepo.count.mockResolvedValueOnce(2);
      const wh = await service.createWarehouse({ vendor_id: "v1", name: "WH3" } as any);
      expect(wh.is_default).toBe(false);
      expect(mockWarehouseRepo.update).not.toHaveBeenCalled();
    });

    it("setDefaultWarehouse unsets others then promotes the target", async () => {
      mockWarehouseRepo.findOne.mockResolvedValueOnce({
        id: "w9",
        vendor_id: "v1",
        is_default: false,
      });
      const wh = await service.setDefaultWarehouse("w9");
      expect(mockWarehouseRepo.update).toHaveBeenCalledWith(
        { vendor_id: "v1" },
        { is_default: false },
      );
      expect(wh.is_default).toBe(true);
      expect(wh.is_active).toBe(true);
    });

    it("updateWarehouse ignores is_default and vendor_id", async () => {
      mockWarehouseRepo.findOne.mockResolvedValueOnce({
        id: "w1",
        vendor_id: "v1",
        is_default: false,
        name: "old",
      });
      const wh = await service.updateWarehouse("w1", {
        name: "new",
        is_default: true,
        vendor_id: "hacker",
      } as any);
      expect(wh.name).toBe("new");
      expect(wh.is_default).toBe(false);
      expect(wh.vendor_id).toBe("v1");
    });

    it("deleteWarehouse refuses to remove the default warehouse", async () => {
      mockWarehouseRepo.findOne.mockResolvedValueOnce({ id: "w1", is_default: true });
      await expect(service.deleteWarehouse("w1")).rejects.toThrow(/default warehouse/i);
      expect(mockWarehouseRepo.softRemove).not.toHaveBeenCalled();
    });

    it("deleteWarehouse soft-removes a non-default warehouse", async () => {
      mockWarehouseRepo.findOne.mockResolvedValueOnce({ id: "w2", is_default: false });
      await service.deleteWarehouse("w2");
      expect(mockWarehouseRepo.softRemove).toHaveBeenCalled();
    });
  });
});
