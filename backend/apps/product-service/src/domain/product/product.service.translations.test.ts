import { describe, expect, mock, test } from "bun:test";
import type { ProductTranslation } from "@materialhub/database";

type TranslationRow = Partial<ProductTranslation>;
type TranslationRepo = ReturnType<typeof makeTranslationRepo>;
type ProductServiceWithTranslations = {
  upsertProductTranslations: (
    repo: TranslationRepo,
    productId: string,
    translations: Array<{
      locale?: string;
      name?: string | null;
      description?: string | null;
      ingredients?: string | null;
      usage_instructions?: string | null;
      meta_title?: string | null;
      meta_description?: string | null;
    }>,
  ) => Promise<void>;
};

function makeTranslationRepo(initialRows: TranslationRow[] = []) {
  const rows = [...initialRows];
  return {
    rows,
    create: (data: TranslationRow) => data,
    save: async (row: TranslationRow) => {
      const index = rows.findIndex(
        (existing) => existing.product_id === row.product_id && existing.locale === row.locale,
      );
      if (index >= 0) rows[index] = { ...rows[index], ...row };
      else rows.push(row);
      return row;
    },
    findOne: async ({ where }: { where: Partial<ProductTranslation> }) =>
      rows.find((row) => row.product_id === where.product_id && row.locale === where.locale) ??
      null,
    remove: async (row: TranslationRow) => {
      const index = rows.indexOf(row);
      if (index >= 0) rows.splice(index, 1);
      return row;
    },
  };
}

mock.module("@materialhub/database", () => ({
  AppDataSource: {
    getRepository: () => ({
      findOne: async () => null,
      save: async (row: unknown) => row,
    }),
    transaction: async (fn: (manager: unknown) => unknown) => fn({}),
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

describe("ProductService product translations", () => {
  test("upserts non-blank translations by product and locale", async () => {
    const repo = makeTranslationRepo([
      {
        product_id: "product-1",
        locale: "ar",
        name: "Old Arabic name",
        description: "Old Arabic description",
      },
    ]);
    const service = Object.create(ProductService.prototype) as ProductServiceWithTranslations;

    await service.upsertProductTranslations(repo, "product-1", [
      {
        locale: "ar",
        name: "Arabic name v1",
        description: "Arabic description v1",
        ingredients: "Arabic ingredients v1",
        usage_instructions: "Arabic usage v1",
        meta_title: "Arabic title v1",
        meta_description: "Arabic meta description v1",
      },
    ]);

    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0]).toMatchObject({
      product_id: "product-1",
      locale: "ar",
      name: "Arabic name v1",
      description: "Arabic description v1",
      ingredients: "Arabic ingredients v1",
      usage_instructions: "Arabic usage v1",
      meta_title: "Arabic title v1",
      meta_description: "Arabic meta description v1",
      deleted_at: null,
    });
  });

  test("removes an existing translation when localized name is blank", async () => {
    const existing = {
      product_id: "product-1",
      locale: "ar",
      name: "Arabic name v1",
    };
    const repo = makeTranslationRepo([existing]);
    const service = Object.create(ProductService.prototype) as ProductServiceWithTranslations;

    await service.upsertProductTranslations(repo, "product-1", [{ locale: "ar", name: "   " }]);

    expect(repo.rows).toEqual([]);
  });
});
