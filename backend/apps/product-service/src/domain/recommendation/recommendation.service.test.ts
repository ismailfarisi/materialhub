import { describe, expect, test } from "bun:test";
import { RecommendationService } from "./recommendation.service.ts";

const PRODUCT_ID = "00000000-0000-0000-0000-000000000001";
const VENDOR_ID = "00000000-0000-0000-0000-0000000000a1";
const OTHER_VENDOR_ID = "00000000-0000-0000-0000-0000000000a2";
const CATEGORY_ID = "00000000-0000-0000-0000-0000000000c1";

type FindCall = {
  where?: any;
  relations?: any;
  order?: any;
  take?: any;
};

function buildService(opts: {
  productFind?: (args: FindCall) => any[];
  productFindOne?: (args: FindCall) => any | null;
  productCreateQueryBuilder?: () => any;
  relationFind?: (args: FindCall) => any[];
}) {
  const service = new RecommendationService();
  const productCalls: FindCall[] = [];
  const relationCalls: FindCall[] = [];

  Object.defineProperty(service, "productRepo", {
    get: () => ({
      find: async (args: FindCall) => {
        productCalls.push(args);
        return opts.productFind ? opts.productFind(args) : [];
      },
      findOne: async (args: FindCall) => {
        return opts.productFindOne ? opts.productFindOne(args) : null;
      },
      createQueryBuilder: () => {
        return opts.productCreateQueryBuilder ? opts.productCreateQueryBuilder() : null;
      },
    }),
  });

  Object.defineProperty(service, "relationRepo", {
    get: () => ({
      find: async (args: FindCall) => {
        relationCalls.push(args);
        return opts.relationFind ? opts.relationFind(args) : [];
      },
    }),
  });

  return { service, productCalls, relationCalls };
}

describe("RecommendationService.moreFromBrand", () => {
  test("filters by vendor_id and excludes the current product", async () => {
    const { service, productCalls } = buildService({
      productFindOne: () => ({
        id: PRODUCT_ID,
        vendor_id: VENDOR_ID,
        category_id: CATEGORY_ID,
      }),
      productFind: () => [
        { id: "p1", vendor_id: VENDOR_ID },
        { id: "p2", vendor_id: VENDOR_ID },
      ],
    });

    const result = await service.moreFromBrand(PRODUCT_ID, 6);

    expect(result.map((p: any) => p.id)).toEqual(["p1", "p2"]);
    const findCall = productCalls.at(-1)!;
    expect(findCall.where.vendor_id).toBe(VENDOR_ID);
    expect(findCall.where.status).toBe("published");
    // Not(productId) — TypeORM FindOperator wraps the value
    expect(findCall.where.id).toBeDefined();
    expect(findCall.where.id.type).toBe("not");
    expect(findCall.where.id.value).toBe(PRODUCT_ID);
    expect(findCall.order).toEqual({ sales_count: "DESC" });
    expect(findCall.take).toBe(6);
  });

  test("returns empty array when product has no vendor_id", async () => {
    const { service } = buildService({
      productFindOne: () => ({ id: PRODUCT_ID, vendor_id: null }),
    });
    const result = await service.moreFromBrand(PRODUCT_ID);
    expect(result).toEqual([]);
  });

  test("returns empty array when product is not found", async () => {
    const { service } = buildService({
      productFindOne: () => null,
    });
    const result = await service.moreFromBrand(PRODUCT_ID);
    expect(result).toEqual([]);
  });
});

describe("RecommendationService.pairsWith", () => {
  test("returns only relations of type cross_sell, ordered by sort_order", async () => {
    const { service, relationCalls } = buildService({
      relationFind: () => [
        { related_product_id: "rp1", relatedProduct: { id: "rp1" } },
        { related_product_id: "rp2", relatedProduct: { id: "rp2" } },
      ],
    });

    const result = await service.pairsWith(PRODUCT_ID, 4);

    expect(result.map((p: any) => p.id)).toEqual(["rp1", "rp2"]);
    const call = relationCalls.at(-1)!;
    expect(call.where.product_id).toBe(PRODUCT_ID);
    expect(call.where.type).toBe("cross_sell");
    expect(call.order).toEqual({ sort_order: "ASC" });
    expect(call.take).toBe(4);
  });

  test("filters out null relatedProduct", async () => {
    const { service } = buildService({
      relationFind: () => [
        { related_product_id: "rp1", relatedProduct: { id: "rp1" } },
        { related_product_id: "rp2", relatedProduct: null },
      ],
    });

    const result = await service.pairsWith(PRODUCT_ID, 4);
    expect(result).toHaveLength(1);
    expect((result[0] as any).id).toBe("rp1");
  });
});

describe("RecommendationService.crossBrand", () => {
  test("excludes same-vendor products in fallback fill", async () => {
    let appliedVendorId: string | undefined;
    let appliedExcludeIds: string[] | undefined;
    let appliedCategoryId: string | undefined;

    const qb: any = {
      leftJoinAndSelect: function () {
        return this;
      },
      where: function (_sql: string, params: any) {
        appliedCategoryId = params.categoryId;
        return this;
      },
      andWhere: function (sql: string, params: any) {
        if (sql.includes("vendor_id <>")) appliedVendorId = params.vendorId;
        if (sql.includes("p.id NOT IN")) appliedExcludeIds = params.excludeIds;
        return this;
      },
      orderBy: function () {
        return this;
      },
      take: function () {
        return this;
      },
      getMany: async () => [{ id: "fb1", vendor_id: OTHER_VENDOR_ID }],
    };

    const { service } = buildService({
      productFindOne: () => ({
        id: PRODUCT_ID,
        vendor_id: VENDOR_ID,
        category_id: CATEGORY_ID,
      }),
      relationFind: () => [
        // Only one related — fallback needed for limit 5
        { related_product_id: "rp1", relatedProduct: { id: "rp1" } },
      ],
      productCreateQueryBuilder: () => qb,
    });

    const result = await service.crossBrand(PRODUCT_ID, 5);

    expect(result.map((p: any) => p.id)).toEqual(["rp1", "fb1"]);
    expect(appliedVendorId).toBe(VENDOR_ID); // <-- cross-brand exclusion applied
    expect(appliedCategoryId).toBe(CATEGORY_ID);
    expect(appliedExcludeIds).toContain(PRODUCT_ID);
    expect(appliedExcludeIds).toContain("rp1");
  });

  test("skips fallback when relations already meet the limit", async () => {
    let qbCalled = false;
    const { service } = buildService({
      relationFind: () => [
        { related_product_id: "rp1", relatedProduct: { id: "rp1" } },
        { related_product_id: "rp2", relatedProduct: { id: "rp2" } },
        { related_product_id: "rp3", relatedProduct: { id: "rp3" } },
      ],
      productCreateQueryBuilder: () => {
        qbCalled = true;
        return null;
      },
    });

    const result = await service.crossBrand(PRODUCT_ID, 3);
    expect(result.map((p: any) => p.id)).toEqual(["rp1", "rp2", "rp3"]);
    expect(qbCalled).toBe(false);
  });
});

describe("RecommendationService.bestsellersInCategory", () => {
  test("filters by category_id and orders by sales_count desc", async () => {
    const { service, productCalls } = buildService({
      productFindOne: () => ({
        id: PRODUCT_ID,
        category_id: CATEGORY_ID,
      }),
      productFind: () => [
        { id: "b1", category_id: CATEGORY_ID, sales_count: 100 },
        { id: "b2", category_id: CATEGORY_ID, sales_count: 50 },
      ],
    });

    const result = await service.bestsellersInCategory(PRODUCT_ID, 8);

    expect(result.map((p: any) => p.id)).toEqual(["b1", "b2"]);
    const findCall = productCalls.at(-1)!;
    expect(findCall.where.category_id).toBe(CATEGORY_ID);
    expect(findCall.where.status).toBe("published");
    expect(findCall.order).toEqual({ sales_count: "DESC" });
    expect(findCall.take).toBe(8);
  });

  test("returns empty array when product has no category_id", async () => {
    const { service } = buildService({
      productFindOne: () => ({ id: PRODUCT_ID, category_id: null }),
    });
    const result = await service.bestsellersInCategory(PRODUCT_ID);
    expect(result).toEqual([]);
  });
});

describe("RecommendationService.youMightAlsoLike (legacy)", () => {
  test("returns relation-based recommendations when there are enough relations", async () => {
    const { service } = buildService({
      relationFind: () => [
        { related_product_id: "rp1", relatedProduct: { id: "rp1" } },
        { related_product_id: "rp2", relatedProduct: { id: "rp2" } },
        { related_product_id: "rp3", relatedProduct: { id: "rp3" } },
        { related_product_id: "rp4", relatedProduct: { id: "rp4" } },
      ],
    });

    const result = await service.youMightAlsoLike(PRODUCT_ID, 4);
    expect(result.map((p: any) => p.id)).toEqual(["rp1", "rp2", "rp3", "rp4"]);
  });
});
