import { describe, expect, it } from "bun:test";
import { ProductCollectionSort } from "@materialhub/database";
import { CollectionResolver, rulesToFilters } from "./collection-resolver.service.ts";

describe("rulesToFilters", () => {
  it("maps rule conditions to ProductFilters", () => {
    const f = rulesToFilters(
      {
        v: 1,
        match: "all",
        conditions: {
          category_slugs: ["fragrance"],
          brand_slugs: ["bx"],
          tags: ["t"],
          sku_in: ["S1"],
          price_min: 1,
          price_max: 9,
          in_stock: true,
        },
      },
      ProductCollectionSort.price_asc,
    );
    expect(f.category).toEqual(["fragrance"]);
    expect(f.brand).toEqual(["bx"]);
    expect(f.tags).toEqual(["t"]);
    expect(f.skus).toEqual(["S1"]);
    expect(f.minPrice).toBe(1);
    expect(f.maxPrice).toBe(9);
    expect(f.inStock).toBe(true);
    expect(f.sortBy).toBe("price_asc");
  });
  it("maps custom sort to undefined sortBy", () => {
    const f = rulesToFilters({ v: 1, match: "all", conditions: {} }, ProductCollectionSort.custom);
    expect(f.sortBy).toBeUndefined();
  });
});

describe("CollectionResolver.resolve", () => {
  const fakeSearch = {
    searchProductIds: async () => ["r1", "r2"],
    searchProducts: async (filters: any) => ({
      data: filters.ids.map((id: string) => ({ id, name: `name-${id}` })),
      total: filters.ids.length,
    }),
  } as any;
  const fakeItems = {
    loadPinsAndExcludes: async () => ({ pinIds: ["p1"], excludeIds: ["r2"] }),
  } as any;

  it("returns pins first, rule matches next, excludes removed, custom order preserved on hydrate", async () => {
    const resolver = new CollectionResolver(fakeSearch, fakeItems);
    const out = await resolver.resolve(
      {
        id: "c1",
        rules: { v: 1, match: "all", conditions: { category_slugs: ["x"] } },
        default_sort: "custom",
        max_products: null,
      } as any,
      { page: 1, perPage: 10 },
    );
    expect(out.items.map((i: any) => i.id)).toEqual(["p1", "r1"]); // r2 excluded
    expect(out.total).toBe(2);
  });

  it("preserves rule order after pins and reports hasMore=false on a full single page", async () => {
    const search = {
      searchProductIds: async () => ["r2", "r1"],
      searchProducts: async (filters: any) => ({
        data: filters.ids.map((id: string) => ({ id })),
        total: filters.ids.length,
      }),
    } as any;
    const items = { loadPinsAndExcludes: async () => ({ pinIds: ["p1"], excludeIds: [] }) } as any;
    const resolver = new CollectionResolver(search, items);
    const out = await resolver.resolve(
      {
        id: "c1",
        rules: { v: 1, match: "all", conditions: { tags: ["x"] } },
        default_sort: "custom",
        max_products: null,
      } as any,
      { page: 1, perPage: 10 },
    );
    expect(out.items.map((i: any) => i.id)).toEqual(["p1", "r2", "r1"]);
    expect(out.hasMore).toBe(false);
  });
});
