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
  generateSlug: (v: string) => v,
}));

// Spread the real module so other exports (SearchSyncProcessor, used by
// search-sync.job.test.ts in the same bun process) survive the mock.
const realSearchSync = await import("../search/search-sync.job.ts");
const syncCalls: any[] = [];
mock.module("../search/search-sync.job.ts", () => ({
  ...realSearchSync,
  enqueueSearchSync: async (d: any) => {
    syncCalls.push(d);
  },
}));

const { ProductService } = await import("./product.service.ts");

function makeService(product: Record<string, any>, all?: Record<string, any>[]) {
  const service = Object.create(ProductService.prototype) as any;
  const products = all ?? [product];
  service.reindexed = [] as string[];
  service.removed = [] as string[];
  service.reindexProduct = async (id: string) => {
    service.reindexed.push(id);
  };
  service.searchService = {
    removeProduct: async (id: string) => {
      service.removed.push(id);
    },
  };
  Object.defineProperty(service, "repo", {
    get: () => ({
      findOne: async ({ where }: any) => products.find((p) => p.id === where.id) ?? null,
      find: async ({ where }: any) =>
        products.filter((p) =>
          where.some((w: any) => w.id === p.id && w.vendor_id === p.vendor_id),
        ),
      save: async (row: unknown) => row,
      update: async (id: string, patch: any) => {
        const p = products.find((x) => x.id === id);
        if (p) Object.assign(p, patch);
      },
      softRemove: async (row: any) => {
        row.deleted_at = new Date();
      },
    }),
  });
  Object.defineProperty(service, "imageRepo", {
    get: () => ({ count: async () => 1 }),
  });
  return service;
}

function draftProduct() {
  // Admin moderation already approved it; only the stock gate is under test.
  return { id: "product-1", vendor_id: "vendor-1", status: "approved", price: 9900 };
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

describe("ProductService.publish — moderation gate", () => {
  for (const status of ["draft", "pending_review", "rejected", "unpublished", "archived"]) {
    test(`refuses to publish a '${status}' product (NOT_APPROVED)`, async () => {
      inventoryRows = [{ quantity_on_hand: 10, quantity_reserved: 0 }];
      const product = { ...draftProduct(), status };
      await expect(makeService(product).publish("product-1", "vendor-1")).rejects.toMatchObject({
        code: "NOT_APPROVED",
      });
      expect(product.status).toBe(status);
    });
  }

  test("publishes an approved product and reindexes it", async () => {
    inventoryRows = [{ quantity_on_hand: 10, quantity_reserved: 0 }];
    const service = makeService(draftProduct());
    const saved = await service.publish("product-1", "vendor-1");
    expect(saved.status).toBe("published");
    expect(service.reindexed).toEqual(["product-1"]);
  });
});

describe("ProductService.unpublish", () => {
  test("takes a live product back to approved and removes it from search", async () => {
    syncCalls.length = 0;
    const product = { ...draftProduct(), status: "published" };
    const service = makeService(product);
    const saved = await service.unpublish("product-1", "vendor-1");
    expect(saved.status).toBe("approved");
    expect(service.removed).toEqual(["product-1"]);
    expect(syncCalls).toContainEqual({ type: "delete", productId: "product-1" });
  });
});

describe("ProductService.bulkAction", () => {
  const row = (id: string, status: string) => ({ id, vendor_id: "vendor-1", status, price: 9900 });

  test("publish validates each product; drafts fail without blocking approved ones", async () => {
    inventoryRows = [{ quantity_on_hand: 10, quantity_reserved: 0 }];
    const products = [row("p-ok", "approved"), row("p-draft", "draft")];
    const service = makeService(products[0], products);
    const result = await service.bulkAction("vendor-1", "publish", ["p-ok", "p-draft"]);
    expect(result.succeeded).toEqual(["p-ok"]);
    expect(result.failed).toEqual([
      { id: "p-draft", code: "NOT_APPROVED", message: expect.any(String) },
    ]);
    expect(products[0].status).toBe("published");
    expect(products[1].status).toBe("draft");
    expect(service.reindexed).toEqual(["p-ok"]);
  });

  test("archive removes the products from search", async () => {
    syncCalls.length = 0;
    const products = [row("p-1", "published"), row("p-2", "approved")];
    const service = makeService(products[0], products);
    const result = await service.bulkAction("vendor-1", "archive", ["p-1", "p-2"]);
    expect(result.affected).toBe(2);
    expect(products.map((p) => p.status)).toEqual(["archived", "archived"]);
    expect(service.removed).toEqual(["p-1", "p-2"]);
    expect(syncCalls).toContainEqual({ type: "delete", productId: "p-1" });
  });

  test("delete removes the products from search", async () => {
    const products = [row("p-1", "published")];
    const service = makeService(products[0], products);
    await service.bulkAction("vendor-1", "delete", ["p-1"]);
    expect(service.removed).toEqual(["p-1"]);
  });

  test("ids of other vendors are reported as not found", async () => {
    const products = [row("p-1", "approved"), { ...row("p-x", "approved"), vendor_id: "other" }];
    const service = makeService(products[0], products);
    inventoryRows = [{ quantity_on_hand: 1, quantity_reserved: 0 }];
    const result = await service.bulkAction("vendor-1", "publish", ["p-1", "p-x"]);
    expect(result.failed).toEqual([
      { id: "p-x", code: "PRODUCT_NOT_FOUND", message: "Product not found" },
    ]);
    expect(products[1].status).toBe("approved");
  });
});
