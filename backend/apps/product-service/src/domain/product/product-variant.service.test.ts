import { beforeEach, describe, expect, mock, test } from "bun:test";

const state = {
  product: { id: "prod-1", vendor_id: "vendor-1", price: 5000, compare_at_price: null } as any,
  existingVariants: [] as any[],
  savedVariants: [] as any[],
  productUpdates: [] as any[],
  softRemoved: [] as any[],
  searchSyncs: [] as any[],
};

class ProductVariantEntity {}

const variantRepo = {
  find: async () => [...state.existingVariants, ...state.savedVariants],
  findOne: async (options?: any) =>
    [...state.existingVariants, ...state.savedVariants].find(
      (v) => v.id === options?.where?.id && v.product_id === options?.where?.product_id,
    ) ?? null,
  create: (row: any) => row,
  save: async (rows: any) => {
    const list = Array.isArray(rows) ? rows : [rows];
    for (const [i, row] of list.entries()) {
      if (!row.id) row.id = `var-${state.savedVariants.length + i + 1}`;
    }
    if (Array.isArray(rows)) state.savedVariants.push(...rows);
    return rows;
  },
  softRemove: async (row: any) => {
    state.softRemoved.push(row);
    state.existingVariants = state.existingVariants.filter((v) => v.id !== row.id);
    state.savedVariants = state.savedVariants.filter((v) => v.id !== row.id);
    return row;
  },
};

const productRepo = {
  findOne: async (options?: any) =>
    options?.where?.id === state.product.id ? state.product : null,
  update: async (id: string, patch: any) => {
    state.productUpdates.push({ id, patch });
  },
};

// Export the same entity superset as the sibling test files — bun's
// mock.module bleeds across files in one process, so a narrower export
// list here would break their imports (and vice versa).
mock.module("@materialhub/database", () => ({
  AppDataSource: {
    getRepository: (entity: any) => (entity === "Product" ? productRepo : variantRepo),
  },
  ProductVariant: ProductVariantEntity,
  Attribute: class {},
  Brand: class {},
  Category: class {},
  Product: class {},
  ProductAttributeValue: class {},
  ProductCategory: class {},
  ProductImage: class {},
  Vendor: class {},
  Inventory: class {},
  InventoryMovement: class {},
  Warehouse: class {},
  WarehouseVendorPermission: class {},
}));

mock.module("@materialhub/plugins", () => ({
  // List filters validate enum values; these tests don't exercise that.
  assertEnumFilter: () => undefined,
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

// Spread the real module so other exports (SearchSyncProcessor, used by
// search-sync.job.test.ts in the same bun process) survive the mock.
const realSearchSync = await import("../search/search-sync.job.ts");
mock.module("../search/search-sync.job.ts", () => ({
  ...realSearchSync,
  enqueueSearchSync: async (job: any) => {
    state.searchSyncs.push(job);
  },
}));

const { ProductVariantService } = await import("./product-variant.service.ts");

const restockCalls: any[] = [];
const inventoryService = {
  restock: async (vendorId: string, data: any) => {
    restockCalls.push({ vendorId, ...data });
    return {};
  },
} as any;

const attributeService = {
  findById: async () => {
    throw new Error("not used in these tests");
  },
} as any;

function makeService() {
  return new ProductVariantService(attributeService, inventoryService);
}

beforeEach(() => {
  state.product = { id: "prod-1", vendor_id: "vendor-1", price: 5000, compare_at_price: null };
  state.existingVariants = [];
  state.savedVariants = [];
  state.productUpdates = [];
  state.softRemoved = [];
  state.searchSyncs = [];
  restockCalls.length = 0;
});

describe("createExplicitVariants", () => {
  test("creates rows with per-variant price, default name/sku, stock, and derived product price", async () => {
    const service = makeService();
    await service.createExplicitVariants("prod-1", "vendor-1", [
      {
        option_values: { size: "m" },
        price: 3000,
        quantity_on_hand: 5,
      },
      {
        option_values: { size: "l" },
        name: "Large",
        sku: "CUSTOM-L",
        price: 4500,
      },
    ]);

    expect(state.savedVariants).toHaveLength(2);
    const [m, l] = state.savedVariants;
    expect(m.name).toBe("m");
    expect(m.sku).toBe("prod-1-m");
    expect(m.price).toBe(3000);
    expect(l.name).toBe("Large");
    expect(l.sku).toBe("CUSTOM-L");
    expect(l.price).toBe(4500);

    // Initial stock restocked against the created variant for the product's vendor
    expect(restockCalls).toHaveLength(1);
    expect(restockCalls[0]).toMatchObject({
      vendorId: "vendor-1",
      product_id: "prod-1",
      variant_id: m.id,
      quantity: 5,
    });

    // Product flips to has_variants with price = min(variant prices)
    expect(state.productUpdates).toHaveLength(1);
    expect(state.productUpdates[0].patch).toEqual({ has_variants: true, price: 3000 });
    expect(state.searchSyncs).toHaveLength(1);
  });

  test("skips rows whose option_values match an existing variant", async () => {
    state.existingVariants = [
      {
        id: "var-old",
        product_id: "prod-1",
        option_values: { size: "m" },
        price: 9999,
        is_active: true,
      },
    ];
    const service = makeService();
    await service.createExplicitVariants("prod-1", "vendor-1", [
      { option_values: { size: "m" }, price: 3000 },
      { option_values: { size: "l" }, price: 4000 },
    ]);

    expect(state.savedVariants).toHaveLength(1);
    expect(state.savedVariants[0].option_values).toEqual({ size: "l" });
  });

  test("rejects when the product belongs to another vendor", async () => {
    const service = makeService();
    await expect(
      service.createExplicitVariants("prod-1", "vendor-2", [
        { option_values: { size: "m" }, price: 3000 },
      ]),
    ).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
  });

  test("admin path (null vendor) restocks for the product's vendor", async () => {
    const service = makeService();
    await service.createExplicitVariants("prod-1", null, [
      { option_values: { size: "s" }, price: 2000, quantity_on_hand: 3 },
    ]);
    expect(restockCalls[0].vendorId).toBe("vendor-1");
  });

  test("enforces the 100-variant cap including existing variants", async () => {
    state.existingVariants = Array.from({ length: 99 }, (_, i) => ({
      id: `var-${i}`,
      product_id: "prod-1",
      option_values: { n: String(i) },
      price: 100,
      is_active: true,
    }));
    const service = makeService();
    await expect(
      service.createExplicitVariants("prod-1", "vendor-1", [
        { option_values: { n: "a" }, price: 100 },
        { option_values: { n: "b" }, price: 100 },
      ]),
    ).rejects.toMatchObject({ code: "TOO_MANY_VARIANTS" });
  });

  test("rejects empty option_values", async () => {
    const service = makeService();
    await expect(
      service.createExplicitVariants("prod-1", "vendor-1", [{ option_values: {}, price: 100 }]),
    ).rejects.toMatchObject({ code: "EMPTY_OPTION_VALUES" });
  });
});

describe("derived product pricing on variant mutations", () => {
  test("update of a variant price resyncs product price to the new min", async () => {
    state.existingVariants = [
      {
        id: "var-1",
        product_id: "prod-1",
        option_values: { size: "m" },
        price: 3000,
        is_active: true,
      },
      {
        id: "var-2",
        product_id: "prod-1",
        option_values: { size: "l" },
        price: 4000,
        is_active: true,
      },
    ];
    const service = makeService();
    await service.update("prod-1", "var-1", { price: 3500 });

    expect(state.productUpdates).toHaveLength(1);
    expect(state.productUpdates[0].patch.price).toBe(3500);
  });

  test("inactive variants are excluded from the min price", async () => {
    state.existingVariants = [
      {
        id: "var-1",
        product_id: "prod-1",
        option_values: { size: "m" },
        price: 3000,
        is_active: true,
      },
      {
        id: "var-2",
        product_id: "prod-1",
        option_values: { size: "l" },
        price: 4000,
        is_active: true,
      },
    ];
    const service = makeService();
    await service.update("prod-1", "var-1", { is_active: false });

    expect(state.productUpdates[0].patch.price).toBe(4000);
  });

  test("removing the last variant clears has_variants", async () => {
    state.existingVariants = [
      {
        id: "var-1",
        product_id: "prod-1",
        option_values: { size: "m" },
        price: 3000,
        is_active: true,
      },
    ];
    const service = makeService();
    await service.remove("prod-1", "var-1");

    expect(state.softRemoved).toHaveLength(1);
    expect(state.productUpdates[0].patch).toEqual({ has_variants: false });
  });

  test("metadata-only variant update does not touch the product", async () => {
    state.existingVariants = [
      {
        id: "var-1",
        product_id: "prod-1",
        option_values: { size: "m" },
        price: 3000,
        is_active: true,
      },
    ];
    const service = makeService();
    await service.update("prod-1", "var-1", { sku: "NEW-SKU" });

    expect(state.productUpdates).toHaveLength(0);
  });
});
