/**
 * Vendor product SEO persistence.
 *
 * `products.meta_keywords` is a text column while both dashboards post a
 * string[], and a vendor save must never demote a product admin has already
 * published.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

type ProductRow = Record<string, any>;

let currentProduct: ProductRow;

mock.module("@materialhub/database", () => ({
  AppDataSource: {
    getRepository: () => ({
      findOne: async () => currentProduct,
      save: async (row: unknown) => row,
    }),
    transaction: async (fn: (manager: unknown) => unknown) =>
      fn({ save: async (_entity: unknown, row: unknown) => row }),
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

function makeService() {
  const service = Object.create(ProductService.prototype) as any;
  // reindexProduct needs Typesense; the update path is what's under test.
  service.reindexProduct = async () => {};
  return service;
}

function product(overrides: ProductRow = {}): ProductRow {
  return {
    id: "product-1",
    vendor_id: "vendor-1",
    name: "Rose Serum",
    status: "draft",
    meta_title: null,
    meta_description: null,
    meta_keywords: null,
    ...overrides,
  };
}

describe("ProductService.update — SEO fields", () => {
  beforeEach(() => {
    currentProduct = product();
  });

  test("persists meta_title and meta_description", async () => {
    const saved = await makeService().update("product-1", "vendor-1", {
      meta_title: "Rose Serum | MaterialHub",
      meta_description: "A hydrating rose serum.",
    });

    expect(saved.meta_title).toBe("Rose Serum | MaterialHub");
    expect(saved.meta_description).toBe("A hydrating rose serum.");
  });

  test("collapses a meta_keywords array into the text column", async () => {
    const saved = await makeService().update("product-1", "vendor-1", {
      meta_keywords: ["rose", " serum ", ""],
    });

    expect(saved.meta_keywords).toBe("rose, serum");
  });

  test("accepts meta_keywords already sent as a string", async () => {
    const saved = await makeService().update("product-1", "vendor-1", {
      meta_keywords: "rose,serum",
    });

    expect(saved.meta_keywords).toBe("rose, serum");
  });

  test("clears SEO fields when they are sent as null", async () => {
    currentProduct = product({
      meta_title: "Old",
      meta_description: "Old",
      meta_keywords: "old",
    });

    const saved = await makeService().update("product-1", "vendor-1", {
      meta_title: null,
      meta_description: null,
      meta_keywords: null,
    });

    expect(saved.meta_title).toBeNull();
    expect(saved.meta_description).toBeNull();
    expect(saved.meta_keywords).toBeNull();
  });

  test("leaves SEO fields untouched when the key is absent", async () => {
    currentProduct = product({ meta_title: "Keep me", meta_keywords: "rose" });

    const saved = await makeService().update("product-1", "vendor-1", { name: "Renamed" });

    expect(saved.meta_title).toBe("Keep me");
    expect(saved.meta_keywords).toBe("rose");
  });
});

describe("ProductService.update — status guard", () => {
  test("moves a draft product into review", async () => {
    currentProduct = product({ status: "draft" });

    const saved = await makeService().update("product-1", "vendor-1", {
      status: "pending_review",
    });

    expect(saved.status).toBe("pending_review");
  });

  test("does not demote a published product back to draft", async () => {
    currentProduct = product({ status: "published" });

    const saved = await makeService().update("product-1", "vendor-1", { status: "draft" });

    expect(saved.status).toBe("published");
  });

  test("ignores an attempt to jump straight to published", async () => {
    currentProduct = product({ status: "draft" });

    const saved = await makeService().update("product-1", "vendor-1", { status: "published" });

    expect(saved.status).toBe("draft");
  });
});
