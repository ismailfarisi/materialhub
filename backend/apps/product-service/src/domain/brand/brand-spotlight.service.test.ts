import { describe, expect, test } from "bun:test";
import { BrandSpotlightService } from "./brand-spotlight.service.ts";

const FEATURED_A = "00000000-0000-0000-0000-00000000fa01"; // sort_order 1
const FEATURED_B = "00000000-0000-0000-0000-00000000fa02"; // sort_order 2
const FILLER_HIGH = "00000000-0000-0000-0000-00000000f100"; // product_count 50
const FILLER_LOW = "00000000-0000-0000-0000-00000000f200"; // product_count 5

describe("BrandSpotlightService.selectBrands", () => {
  test("returns featured brands first (by sort_order), then non-featured by product_count DESC", async () => {
    const service = new BrandSpotlightService();
    const calls: Array<{ sql: string; params: unknown[] }> = [];

    (service as any).runQuery = async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      return [
        {
          id: FEATURED_A,
          name: "A",
          slug: "a",
          logo_url: null,
          description: null,
          product_count: 10,
          is_featured: true,
        },
        {
          id: FEATURED_B,
          name: "B",
          slug: "b",
          logo_url: null,
          description: null,
          product_count: 8,
          is_featured: true,
        },
        {
          id: FILLER_HIGH,
          name: "High",
          slug: "high",
          logo_url: null,
          description: null,
          product_count: 50,
          is_featured: false,
        },
        {
          id: FILLER_LOW,
          name: "Low",
          slug: "low",
          logo_url: null,
          description: null,
          product_count: 5,
          is_featured: false,
        },
      ];
    };

    const candidates = await (service as any).selectBrands(8);
    expect(candidates.map((b: any) => b.slug)).toEqual(["a", "b", "high", "low"]);
    expect(calls[0]!.sql).toContain(
      "ORDER BY is_featured DESC, sort_order ASC, product_count DESC, name ASC",
    );
    expect(calls[0]!.params[0]).toBe(12); // limit * 1.5 over-fetch (Math.ceil(8 * 1.5))
  });
});

const BRAND_X = "00000000-0000-0000-0000-0000000000bx";
const BRAND_Y = "00000000-0000-0000-0000-0000000000by";

describe("BrandSpotlightService.loadTopProductsByBrand", () => {
  test("returns top products grouped by brand_id; brand with 0 products is absent from map", async () => {
    const service = new BrandSpotlightService();

    (service as any).runQuery = async () => [
      { brand_id: BRAND_X, id: "p1", name: "P1", slug: "p1", price: 10000, image_url: "i1.jpg" },
      { brand_id: BRAND_X, id: "p2", name: "P2", slug: "p2", price: 20000, image_url: "i2.jpg" },
      { brand_id: BRAND_X, id: "p3", name: "P3", slug: "p3", price: 30000, image_url: "i3.jpg" },
      // BRAND_Y has no rows → absent from result map.
    ];

    const map = await (service as any).loadTopProductsByBrand([BRAND_X, BRAND_Y]);
    expect(map.get(BRAND_X)).toHaveLength(3);
    expect(map.get(BRAND_X)![0].slug).toBe("p1");
    expect(map.get(BRAND_Y)).toBeUndefined();
  });

  test("returns empty map when no brand ids", async () => {
    const service = new BrandSpotlightService();
    let called = false;
    (service as any).runQuery = async () => {
      called = true;
      return [];
    };
    const map = await (service as any).loadTopProductsByBrand([]);
    expect(map.size).toBe(0);
    expect(called).toBe(false); // short-circuits — no SQL fired
  });
});

describe("BrandSpotlightService.getSpotlight", () => {
  test("drops brands with empty product groups, then truncates to limit, preserving candidate order", async () => {
    const service = new BrandSpotlightService();

    (service as any).selectBrands = async (limit: number) => {
      expect(limit).toBe(4);
      return [
        {
          id: "f1",
          name: "F1",
          slug: "f1",
          logo_url: null,
          description: null,
          product_count: 10,
          is_featured: true,
        },
        {
          id: "f2",
          name: "F2",
          slug: "f2",
          logo_url: null,
          description: null,
          product_count: 8,
          is_featured: true,
        },
        {
          id: "f3",
          name: "F3",
          slug: "f3",
          logo_url: null,
          description: null,
          product_count: 0,
          is_featured: true,
        }, // dropped
        {
          id: "f4",
          name: "F4",
          slug: "f4",
          logo_url: null,
          description: null,
          product_count: 99,
          is_featured: false,
        },
      ];
    };
    (service as any).loadTopProductsByBrand = async (_ids: string[]) => {
      const m = new Map<string, any[]>();
      m.set("f1", [{ id: "p1", name: "P1", slug: "p1", price: 1000, image_url: null }]);
      m.set("f2", [{ id: "p2", name: "P2", slug: "p2", price: 2000, image_url: null }]);
      // f3 absent → dropped
      m.set("f4", [{ id: "p4", name: "P4", slug: "p4", price: 4000, image_url: null }]);
      return m;
    };

    const result = await service.getSpotlight(4);
    expect(result.map((b) => b.slug)).toEqual(["f1", "f2", "f4"]);
    expect(result[0]!.top_products[0]!.slug).toBe("p1");
  });

  test("clamps limit to [4, 12]", async () => {
    const service = new BrandSpotlightService();
    let observedLimit = -1;
    (service as any).selectBrands = async (limit: number) => {
      observedLimit = limit;
      return [];
    };
    (service as any).loadTopProductsByBrand = async () => new Map();

    await service.getSpotlight(2); // below floor
    expect(observedLimit).toBe(4);
    await service.getSpotlight(99); // above ceiling
    expect(observedLimit).toBe(12);
    await service.getSpotlight(8);
    expect(observedLimit).toBe(8);
  });
});
