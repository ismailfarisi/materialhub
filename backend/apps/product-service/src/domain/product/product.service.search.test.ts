import { describe, expect, mock, test } from "bun:test";

// Mock all exports from @materialhub/database before importing ProductService
const dbMockExports: Record<string, any> = {
  AppDataSource: {
    getRepository: () => ({
      findOne: async () => ({ id: "cat-skincare" }),
      find: async () => [],
      findOneBy: async () => null,
    }),
  },
  Attribute: class {},
  Brand: class {},
  Category: class {},
  Product: class {},
  ProductAttributeValue: class {},
  ProductCategory: class {},
  ProductImage: class {},
  Vendor: class {},
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
  Warehouse: class {},
  WarehouseVendorPermission: class {},
  ProductVariant: class {},
  ProductTranslation: class {},
  Inventory: class {},
  InventoryMovement: class {},
  ProductGroup: class {},
  ProductGroupMember: class {},
  AttributeValue: class {},
};

mock.module("@materialhub/database", () => dbMockExports);
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
  generateSlug: (s: string) => s.toLowerCase().replace(/\s+/g, "-"),
}));

const { ProductService } = await import("./product.service.ts");

describe("ProductService.search — URL param normalization", () => {
  test("maps ?q=dior to filters.query so the adapter receives full-text query", async () => {
    const captured: any[] = [];
    const fakeAdapter = {
      searchProducts: async (filters: any) => {
        captured.push(filters);
        return { data: [], total: 0, facets: {} };
      },
    };
    const svc = new ProductService(fakeAdapter as any);
    // validateFilterSlugs short-circuits when no category/brand/vendor slugs.
    await svc.search({ q: "dior" });
    expect(captured[0].query).toBe("dior");
  });

  test("explicit `query` wins over `q` when both supplied", async () => {
    const captured: any[] = [];
    const fakeAdapter = {
      searchProducts: async (filters: any) => {
        captured.push(filters);
        return { data: [], total: 0, facets: {} };
      },
    };
    const svc = new ProductService(fakeAdapter as any);
    await svc.search({ q: "dior", query: "chanel" });
    expect(captured[0].query).toBe("chanel");
  });
});

describe("ProductService.create inventory", () => {
  test("creates initial product-level inventory for simple vendor products", async () => {
    const savedInventory: any[] = [];
    const origGetRepository = dbMockExports.AppDataSource.getRepository;
    const origTransaction = dbMockExports.AppDataSource.transaction;

    dbMockExports.AppDataSource.getRepository = (entity: any) => {
      if (entity === dbMockExports.Vendor) {
        return {
          findOne: async () => ({ id: "vendor-1", status: "approved" }),
        };
      }
      if (entity === dbMockExports.Product) {
        return {
          findOne: async () => null,
        };
      }
      return {
        findOne: async () => null,
        find: async () => [],
        findOneBy: async () => null,
      };
    };

    dbMockExports.AppDataSource.transaction = async (fn: any) =>
      fn({
        save: async (entity: any, value: any) => {
          if (entity === dbMockExports.Product) return { ...value, id: "product-1" };
          return value;
        },
        create: (_entity: any, value: any) => value,
        getRepository: (entity: any) => {
          if (entity === dbMockExports.Warehouse) {
            return {
              findOne: async () => ({ id: "warehouse-1", vendor_id: "vendor-1" }),
            };
          }
          if (entity === "Inventory") {
            return {
              create: (value: any) => value,
              save: async (value: any) => {
                savedInventory.push(value);
                return value;
              },
            };
          }
          return {
            findOne: async () => null,
          };
        },
      });

    const svc = new ProductService({ upsertProduct: async () => undefined } as any);

    await svc.create("vendor-1", {
      name: "Simple Product",
      category_id: "cat-1",
      price: 1000,
      has_variants: false,
      quantity_on_hand: 12,
    });

    dbMockExports.AppDataSource.getRepository = origGetRepository;
    dbMockExports.AppDataSource.transaction = origTransaction;

    expect(savedInventory).toEqual([
      {
        product_id: "product-1",
        vendor_id: "vendor-1",
        warehouse_id: "warehouse-1",
        quantity_on_hand: 12,
        quantity_reserved: 0,
        // Seeded explicitly; the column otherwise defaults to 0 and the row
        // starts out disagreeing with on_hand - reserved.
        quantity_available: 12,
      },
    ]);
  });
});
