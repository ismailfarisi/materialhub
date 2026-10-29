import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { AppDataSource } from "@materialhub/database";
import { IsNull } from "typeorm";

const searchSyncs: any[] = [];

// enqueueSearchSync opens a BullMQ/Redis connection at call time; these are
// mocked-repo unit tests with no Redis, so the real module hangs the suite.
mock.module("../search/search-sync.job.ts", () => ({
  enqueueSearchSync: async (job: any) => {
    searchSyncs.push(job);
  },
}));

const { InventoryService } = await import("./inventory.service.ts");

describe("InventoryService", () => {
  const inventoryRepo = {
    findOne: mock((): Promise<any | null> => Promise.resolve(null)),
    find: mock((): Promise<any[]> => Promise.resolve([])),
  };
  const warehouseRepo = {
    findOne: mock((): Promise<any | null> => Promise.resolve(null)),
  };
  const permissionRepo = {
    findOne: mock((): Promise<any | null> => Promise.resolve(null)),
  };
  const manager = {
    getRepository: mock((target: any) => {
      const name = typeof target === "string" ? target : target?.name;
      if (name === "Inventory") return inventoryRepo;
      if (name === "Warehouse") return warehouseRepo;
      if (name === "WarehouseVendorPermission") return permissionRepo;
      return {};
    }),
    create: mock((_target: any, data: any) => data),
    save: mock((_target: any, entity: any) => Promise.resolve(entity)),
  };
  const originalTransaction = AppDataSource.transaction;

  beforeEach(() => {
    inventoryRepo.findOne.mockClear();
    inventoryRepo.find.mockClear();
    warehouseRepo.findOne.mockClear();
    permissionRepo.findOne.mockClear();
    manager.getRepository.mockClear();
    manager.create.mockClear();
    manager.save.mockClear();
    inventoryRepo.findOne.mockResolvedValue(null);
    inventoryRepo.find.mockResolvedValue([]);
    warehouseRepo.findOne.mockResolvedValue(null);
    permissionRepo.findOne.mockResolvedValue(null);
    AppDataSource.transaction = ((cb: any) => cb(manager)) as any;
  });

  afterEach(() => {
    AppDataSource.transaction = originalTransaction;
  });

  it("restock with no explicit warehouse looks the row up across warehouses", async () => {
    inventoryRepo.find.mockResolvedValueOnce([
      {
        id: "inv-1",
        product_id: "p1",
        vendor_id: "vendor-1",
        warehouse_id: "wh-somewhere-else",
        quantity_on_hand: 4,
        quantity_reserved: 1,
      },
    ]);

    await new InventoryService().restock("vendor-1", {
      product_id: "p1",
      quantity: 3,
    });

    // The lookup must not pin the query to the vendor's default warehouse —
    // that is what made rows in any other warehouse invisible.
    expect(inventoryRepo.find).toHaveBeenCalledWith({
      where: {
        product_id: "p1",
        variant_id: IsNull(),
        vendor_id: "vendor-1",
      },
      lock: { mode: "pessimistic_write" },
    });
    // The default warehouse is only consulted when no row exists at all.
    expect(warehouseRepo.findOne).not.toHaveBeenCalled();
  });

  it("rejects explicit warehouse without owner or share permission", async () => {
    warehouseRepo.findOne.mockResolvedValueOnce({
      id: "wh-other",
      vendor_id: "vendor-2",
      is_active: true,
    });

    await expect(
      new InventoryService().restock("vendor-1", {
        product_id: "p1",
        warehouse_id: "wh-other",
        quantity: 3,
      }),
    ).rejects.toThrow("Warehouse not available for this vendor");

    expect(inventoryRepo.findOne).not.toHaveBeenCalled();
  });

  it("allows explicit shared warehouse with fulfillment permission", async () => {
    warehouseRepo.findOne.mockResolvedValueOnce({
      id: "wh-shared",
      vendor_id: "vendor-2",
      is_active: true,
    });
    permissionRepo.findOne.mockResolvedValueOnce({ id: "grant-1" });

    await new InventoryService().restock("vendor-1", {
      product_id: "p1",
      warehouse_id: "wh-shared",
      quantity: 3,
    });

    expect(inventoryRepo.findOne).toHaveBeenCalledWith({
      where: {
        product_id: "p1",
        variant_id: IsNull(),
        vendor_id: "vendor-1",
        warehouse_id: "wh-shared",
      },
      lock: { mode: "pessimistic_write" },
    });
  });
});
