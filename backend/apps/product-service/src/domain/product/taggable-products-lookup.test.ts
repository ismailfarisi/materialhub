import { describe, expect, it } from "bun:test";
import { TaggableProductsLookupService } from "./taggable-products-lookup.service.ts";

function makeQB(rows: any[]) {
  const qb: any = {
    leftJoin: () => qb,
    select: () => qb,
    where: () => qb,
    andWhere: () => qb,
    orderBy: () => qb,
    addOrderBy: () => qb,
    limit: () => qb,
    setParameters: () => qb,
    getRawMany: async () => rows,
  };
  return qb;
}

describe("TaggableProductsLookupService.listByVendor", () => {
  it("returns hydrated rows with null variant_label / delivered_at", async () => {
    const raw = [
      {
        product_id: "p1",
        name: "Gold ring",
        thumbnail_url: "https://img/p1.jpg",
      },
    ];
    const fakeRepo = { createQueryBuilder: () => makeQB(raw) };
    const svc = new TaggableProductsLookupService(fakeRepo as any);
    const out = await svc.listByVendor({ vendorId: "v1", q: null, limit: 20 });
    expect(out).toEqual([
      {
        product_id: "p1",
        name: "Gold ring",
        thumbnail_url: "https://img/p1.jpg",
        variant_label: null,
        delivered_at: null,
      },
    ]);
  });

  it("clamps limit to 1..50", async () => {
    const calls: number[] = [];
    const fakeRepo = {
      createQueryBuilder: () => {
        const qb: any = {
          leftJoin: () => qb,
          select: () => qb,
          where: () => qb,
          andWhere: () => qb,
          orderBy: () => qb,
          addOrderBy: () => qb,
          limit: (n: number) => {
            calls.push(n);
            return qb;
          },
          setParameters: () => qb,
          getRawMany: async () => [],
        };
        return qb;
      },
    };
    const svc = new TaggableProductsLookupService(fakeRepo as any);
    await svc.listByVendor({ vendorId: "v1", q: null, limit: 0 });
    await svc.listByVendor({ vendorId: "v1", q: null, limit: 999 });
    expect(calls).toEqual([1, 50]);
  });
});

describe("TaggableProductsLookupService.listByPermission", () => {
  it("specific_products: returns [] when productIds empty", async () => {
    const fakeRepo = { createQueryBuilder: () => makeQB([]) };
    const svc = new TaggableProductsLookupService(fakeRepo as any);
    const out = await svc.listByPermission({
      scope: "specific_products",
      productIds: [],
      q: null,
      limit: 20,
    });
    expect(out).toEqual([]);
  });

  it("specific_brand: returns [] when brandId missing", async () => {
    const fakeRepo = { createQueryBuilder: () => makeQB([]) };
    const svc = new TaggableProductsLookupService(fakeRepo as any);
    const out = await svc.listByPermission({
      scope: "specific_brand",
      brandId: null,
      q: null,
      limit: 20,
    });
    expect(out).toEqual([]);
  });

  it("specific_vendor: returns [] when vendorId missing", async () => {
    const fakeRepo = { createQueryBuilder: () => makeQB([]) };
    const svc = new TaggableProductsLookupService(fakeRepo as any);
    const out = await svc.listByPermission({
      scope: "specific_vendor",
      vendorId: null,
      q: null,
      limit: 20,
    });
    expect(out).toEqual([]);
  });

  it("any_product: returns hydrated rows", async () => {
    const raw = [{ product_id: "p1", name: "Any Product", thumbnail_url: null }];
    const fakeRepo = { createQueryBuilder: () => makeQB(raw) };
    const svc = new TaggableProductsLookupService(fakeRepo as any);
    const out = await svc.listByPermission({ scope: "any_product", q: null, limit: 20 });
    expect(out).toEqual([
      {
        product_id: "p1",
        name: "Any Product",
        thumbnail_url: null,
        variant_label: null,
        delivered_at: null,
      },
    ]);
  });
});
