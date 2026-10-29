/**
 * Publish gates on real stock, not on the `quantity_available` column.
 *
 * `quantity_available` is a denormalized copy of `quantity_on_hand -
 * quantity_reserved`, maintained in application code and nowhere enforced. On
 * production 11,089 of 11,277 live rows disagree with the formula (always too
 * low), so vendors were told "Product must have inventory to publish" for
 * products that plainly had stock. Everything else in the codebase already
 * derives availability from the two authoritative columns.
 */

import { describe, expect, mock, test } from "bun:test";

type InventoryRow = { quantity_on_hand: number; quantity_reserved: number };

let inventoryRows: InventoryRow[] = [];
let capturedConditions: string[] = [];

function fakeQueryBuilder() {
  const qb: any = {
    where: (c: string) => {
      capturedConditions.push(c);
      return qb;
    },
    andWhere: (c: string) => {
      capturedConditions.push(c);
      return qb;
    },
    // Evaluate the intent of the conditions against the in-memory rows.
    getCount: async () =>
      inventoryRows.filter((r) => r.quantity_on_hand - r.quantity_reserved > 0).length,
  };
  return qb;
}

mock.module("@materialhub/database", () => ({
  AppDataSource: {
    getRepository: (entity: unknown) => {
      const name = typeof entity === "string" ? entity : (entity as any)?.name;
      if (name === "Inventory") return { createQueryBuilder: () => fakeQueryBuilder() };
      return { findOne: async () => null, save: async (row: unknown) => row };
    },
    transaction: async (fn: (m: unknown) => unknown) => fn({}),
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
  generateSlug: (v: string) => v,
}));

mock.module("../search/search-sync.job.ts", () => ({
  enqueueSearchSync: async () => {},
}));

const { ProductService } = await import("./product.service.ts");

function makeService(product: Record<string, any>) {
  const service = Object.create(ProductService.prototype) as any;
  service.reindexProduct = async () => {};
  Object.defineProperty(service, "repo", {
    get: () => ({
      findOne: async () => product,
      save: async (row: unknown) => row,
    }),
  });
  Object.defineProperty(service, "imageRepo", {
    get: () => ({ count: async () => 1 }),
  });
  return service;
}

function draftProduct() {
  return { id: "product-1", vendor_id: "vendor-1", status: "draft", price: 9900 };
}

describe("ProductService.publish — inventory gate", () => {
  test("publishes when on_hand exceeds reserved, even if quantity_available is stale at 0", async () => {
    inventoryRows = [{ quantity_on_hand: 40, quantity_reserved: 0 }];
    capturedConditions = [];

    const saved = await makeService(draftProduct()).publish("product-1", "vendor-1");

    expect(saved.status).toBe("published");
    // The gate must not consult the denormalized column.
    expect(capturedConditions.join(" ")).not.toContain("quantity_available");
  });

  test("still refuses to publish a product with no stock", async () => {
    inventoryRows = [{ quantity_on_hand: 0, quantity_reserved: 0 }];

    await expect(
      makeService(draftProduct()).publish("product-1", "vendor-1"),
    ).rejects.toMatchObject({ code: "NO_INVENTORY" });
  });

  test("refuses to publish when every unit is reserved", async () => {
    inventoryRows = [{ quantity_on_hand: 5, quantity_reserved: 5 }];

    await expect(
      makeService(draftProduct()).publish("product-1", "vendor-1"),
    ).rejects.toMatchObject({ code: "NO_INVENTORY" });
  });
});
