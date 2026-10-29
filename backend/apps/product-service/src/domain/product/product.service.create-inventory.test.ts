/**
 * Product create seeds a product-level inventory row only for simple products,
 * with the opening stock the vendor typed.
 *
 * Both `has_variants` and `quantity_on_hand` were previously stripped by the
 * route schema, so create() always saw `undefined`: every product (variable
 * ones included) got a product-level inventory row, always with 0 on hand.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

type SavedInventory = Record<string, any>;

let savedInventory: SavedInventory[] = [];

const inventoryRepo = {
  create: (row: SavedInventory) => row,
  save: async (row: SavedInventory) => {
    savedInventory.push(row);
    return row;
  },
};

const fakeManager = {
  create: (_entity: unknown, row: unknown) => row,
  save: async (_entity: unknown, row: any) => ({ id: "product-1", ...row }),
  getRepository: (entity: unknown) => {
    if (entity === "Inventory") return inventoryRepo;
    // Warehouse / WarehouseVendorPermission lookups during resolveWarehouseId
    return { findOne: async () => ({ id: "warehouse-1", vendor_id: "vendor-1" }) };
  },
};

mock.module("@materialhub/database", () => ({
  AppDataSource: {
    getRepository: () => ({
      // Vendor approval check, then the slug-collision lookup.
      findOne: async ({ where }: any) =>
        where?.slug !== undefined ? null : { id: "vendor-1", status: "approved" },
      save: async (row: unknown) => row,
    }),
    transaction: async (fn: (manager: unknown) => unknown) => fn(fakeManager),
  },
  Attribute: class {},
  Brand: class {},
  Category: class {},
  FlashDeal: class {},
  Product: class {},
  ProductAttributeValue: class {},
  ProductCategory: class {},
  ProductGroup: class {},
  ProductGroupMember: class {},
  ProductImage: class {},
  ProductTranslation: class {},
  Vendor: class {},
  Warehouse: class {},
  WarehouseVendorPermission: class {},
  WAREHOUSE_FULFILLMENT_PERMISSION: "fulfillment",
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

mock.module("@materialhub/utils", () => ({
  generateSlug: (value: string) => value.toLowerCase().replace(/\s+/g, "-"),
}));

mock.module("../search/search-sync.job.ts", () => ({
  enqueueSearchSync: async () => {},
}));

const { ProductService } = await import("./product.service.ts");

function makeService() {
  const service = Object.create(ProductService.prototype) as any;
  service.reindexProduct = async () => {};
  return service;
}

const baseInput = { name: "Rose Serum", category_id: "category-1", price: 9900 };

describe("ProductService.create — inventory seeding", () => {
  beforeEach(() => {
    savedInventory = [];
  });

  test("seeds a simple product's inventory with the opening stock", async () => {
    await makeService().create("vendor-1", {
      ...baseInput,
      has_variants: false,
      quantity_on_hand: 42,
    });

    expect(savedInventory).toHaveLength(1);
    expect(savedInventory[0]).toMatchObject({
      product_id: "product-1",
      vendor_id: "vendor-1",
      quantity_on_hand: 42,
      quantity_reserved: 0,
      // Seeded rows historically defaulted this to 0, leaving them inconsistent
      // with on_hand - reserved from birth.
      quantity_available: 42,
    });
  });

  test("defaults a simple product to zero when no stock is given", async () => {
    await makeService().create("vendor-1", { ...baseInput, has_variants: false });

    expect(savedInventory).toHaveLength(1);
    expect(savedInventory[0]?.quantity_on_hand).toBe(0);
  });

  test("seeds no product-level inventory row for a variable product", async () => {
    await makeService().create("vendor-1", { ...baseInput, has_variants: true });

    // Per-variant inventory is created later by the variant service.
    expect(savedInventory).toEqual([]);
  });
});
