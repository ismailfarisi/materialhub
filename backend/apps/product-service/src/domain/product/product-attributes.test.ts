import { describe, expect, mock, test } from "bun:test";

const savedRows: any[] = [];
const softDeletes: any[] = [];
const product = { id: "prod-1", vendor_id: "vendor-1", name: "Test", price: 1000 };

mock.module("@materialhub/database", () => ({
  AppDataSource: {
    getRepository: () => ({
      findOne: async (options?: any) => {
        if (options?.where?.id === "prod-1") return product;
        if (options?.where?.id === "vendor-1") return { id: "vendor-1", status: "approved" };
        return null;
      },
      save: async (row: any) => row,
    }),
    transaction: async (fn: any) =>
      fn({
        save: async (_entity: any, row: any) => {
          if (row?.product_id) savedRows.push(row);
          return row;
        },
        softDelete: async (_entity: any, criteria: any) => {
          softDeletes.push(criteria);
        },
        create: (_entity: any, row: any) => row,
      }),
  },
  Attribute: class {},
  Brand: class {},
  Category: class {},
  Product: class {},
  ProductAttributeValue: class {},
  ProductCategory: class {},
  ProductImage: class {},
  ProductVariant: class {},
  Vendor: class {},
  Inventory: class {},
  InventoryMovement: class {},
  Warehouse: class {},
  WarehouseVendorPermission: class {},
  ProductGroup: class {},
  ProductGroupMember: class {},
  AuditLog: class {},
  Order: class {},
  OrderItem: class {},
  VendorOrder: class {},
  Address: class {},
  User: class {},
  Cart: class {},
  CartItem: class {},
  Coupon: class {},
  Commission: class {},
  PaymentMethod: class {},
  Shipment: class {},
  ShipmentItem: class {},
  ShipmentTracking: class {},
  AttributeValue: class {},
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

mock.module("@materialhub/utils", () => ({
  generateSlug: (value: string) => value.toLowerCase().replace(/\s+/g, "-"),
}));

// Spread the real module so other exports (SearchSyncProcessor, used by
// search-sync.job.test.ts in the same bun process) survive the mock.
const realSearchSync = await import("../search/search-sync.job.ts");
mock.module("../search/search-sync.job.ts", () => ({
  ...realSearchSync,
  enqueueSearchSync: async () => {},
}));

const { ProductService } = await import("./product.service.ts");

describe("ProductService product attributes", () => {
  test("vendor update replaces product-level attribute rows", async () => {
    savedRows.length = 0;
    softDeletes.length = 0;

    const service = new ProductService({
      indexProduct: async () => {},
      removeProduct: async () => {},
    } as any);

    await service.update("prod-1", "vendor-1", {
      attributes: [
        { attribute_id: "attr-select", value_id: "val-1" },
        { attribute_id: "attr-text", text_value: "Paraben free" },
      ],
    });

    expect(softDeletes).toHaveLength(1);
    expect(softDeletes[0].product_id).toBe("prod-1");
    expect(softDeletes[0].variant_id).toBeDefined();
    expect(savedRows).toEqual([
      {
        product_id: "prod-1",
        variant_id: null,
        attribute_id: "attr-select",
        attribute_value_id: "val-1",
        text_value: null,
      },
      {
        product_id: "prod-1",
        variant_id: null,
        attribute_id: "attr-text",
        attribute_value_id: null,
        text_value: "Paraben free",
      },
    ]);
  });
});
