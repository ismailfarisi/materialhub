import { describe, expect, test } from "bun:test";
import { BidStatus, SourceMode } from "@materialhub/database";
import { LayoutResolverService, manualProductIds, orderByIds } from "./layout-resolver.service.ts";

describe("LayoutResolverService.resolveBidded with previewBidId", () => {
  test("hot-swaps a pending bid into the top slot when its bid_id matches the section", async () => {
    const service = new LayoutResolverService();

    const section: any = {
      id: "section-A",
      bid_config: { slots: 2 },
      source_mode: SourceMode.bidded,
    };

    const winningBid = {
      id: "won-bid-1",
      vendor_id: "v1",
      product_id: "p1",
      content: { image: { desktop: { url: "won.jpg" } } },
      bid_amount_fils: 30000,
    };
    const previewBid = {
      id: "pending-bid-1",
      vendor_id: "v2",
      product_id: "p2",
      content: { image: { desktop: { url: "pending.jpg" } } },
      bid_amount_fils: 10000,
      section_id: "section-A",
      status: BidStatus.pending,
    };

    (service as any)._bidRepo = {
      createQueryBuilder: () => ({
        where: () => ({
          andWhere: () => ({
            andWhere: () => ({
              andWhere: () => ({
                orderBy: () => ({
                  take: () => ({ getMany: async () => [winningBid] }),
                }),
              }),
            }),
          }),
        }),
      }),
      findOne: async () => previewBid,
    };

    const result = await (service as any).resolveBidded(section, "pending-bid-1");

    expect(result).toHaveLength(2);
    expect(result[0].bid_id).toBe("pending-bid-1");
    expect(result[1].bid_id).toBe("won-bid-1");
  });

  test("ignores previewBidId when bid is on a different section", async () => {
    const service = new LayoutResolverService();
    const section: any = {
      id: "section-A",
      bid_config: { slots: 4 },
      source_mode: SourceMode.bidded,
    };
    (service as any)._bidRepo = {
      createQueryBuilder: () => ({
        where: () => ({
          andWhere: () => ({
            andWhere: () => ({
              andWhere: () => ({
                orderBy: () => ({ take: () => ({ getMany: async () => [] }) }),
              }),
            }),
          }),
        }),
      }),
      findOne: async () => ({
        id: "preview-bid",
        section_id: "section-B",
        bid_amount_fils: 1,
        content: {},
      }),
    };
    const result = await (service as any).resolveBidded(section, "preview-bid");
    expect(result).toEqual([]);
  });

  test("ignores previewBidId when bid does not exist", async () => {
    const service = new LayoutResolverService();
    const section: any = {
      id: "section-A",
      bid_config: { slots: 4 },
      source_mode: SourceMode.bidded,
    };
    (service as any)._bidRepo = {
      createQueryBuilder: () => ({
        where: () => ({
          andWhere: () => ({
            andWhere: () => ({
              andWhere: () => ({
                orderBy: () => ({ take: () => ({ getMany: async () => [] }) }),
              }),
            }),
          }),
        }),
      }),
      findOne: async () => null,
    };
    const result = await (service as any).resolveBidded(section, "missing-bid");
    expect(result).toEqual([]);
  });
});

describe("LayoutResolverService.resolveBidded — vendor_showcase hydration", () => {
  const buildBidRepo = (winningBids: any[]) => ({
    createQueryBuilder: () => ({
      where: () => ({
        andWhere: () => ({
          andWhere: () => ({
            andWhere: () => ({
              orderBy: () => ({ take: () => ({ getMany: async () => winningBids }) }),
            }),
          }),
        }),
      }),
    }),
    findOne: async () => null,
  });

  test("merges name/logo_url/rating_avg/slug into vendor_showcase items", async () => {
    const service = new LayoutResolverService();
    const section: any = {
      id: "vs-1",
      bid_config: { slots: 2 },
      source_mode: SourceMode.bidded,
      section_type: { name: "vendor_showcase", scope: "platform" },
    };
    (service as any)._bidRepo = buildBidRepo([
      { id: "bid-1", vendor_id: "v-1", product_id: null, content: null, bid_amount_fils: 50000 },
      { id: "bid-2", vendor_id: "v-2", product_id: null, content: null, bid_amount_fils: 30000 },
    ]);
    (service as any)._vendorRepo = {
      find: async () => [
        {
          id: "v-1",
          slug: "alpha",
          name: "Alpha Packaging",
          logo_url: "alpha.png",
          rating_avg: "4.50",
          total_orders: 12,
          follower_count: 88,
        },
        {
          id: "v-2",
          slug: "beta",
          name: "Beta Glow",
          logo_url: null,
          rating_avg: "0.00",
          total_orders: 0,
          follower_count: 0,
        },
      ],
    };

    const result = await (service as any).resolveBidded(section);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: "v-1",
      bid_id: "bid-1",
      sponsored: true,
      name: "Alpha Packaging",
      slug: "alpha",
      logo_url: "alpha.png",
      rating_avg: "4.50",
      total_orders: 12,
      follower_count: 88,
    });
    expect(result[1]).toMatchObject({
      id: "v-2",
      bid_id: "bid-2",
      name: "Beta Glow",
      slug: "beta",
      logo_url: null,
    });
  });

  test("drops items whose vendor was soft-deleted (not returned by repo)", async () => {
    const service = new LayoutResolverService();
    const section: any = {
      id: "vs-2",
      bid_config: { slots: 2 },
      source_mode: SourceMode.bidded,
      section_type: { name: "vendor_showcase", scope: "platform" },
    };
    (service as any)._bidRepo = buildBidRepo([
      { id: "bid-x", vendor_id: "v-gone", product_id: null, content: null, bid_amount_fils: 50000 },
    ]);
    (service as any)._vendorRepo = { find: async () => [] };

    const result = await (service as any).resolveBidded(section);
    expect(result).toEqual([]);
  });

  test("does not hydrate non-vendor_showcase bidded sections via vendor lookup", async () => {
    const service = new LayoutResolverService();
    const section: any = {
      id: "pc-1",
      bid_config: { slots: 1 },
      source_mode: SourceMode.bidded,
      section_type: { name: "product_carousel", scope: "platform" },
    };
    (service as any)._bidRepo = buildBidRepo([
      { id: "bid-p", vendor_id: "v-1", product_id: "p-1", content: null, bid_amount_fils: 1000 },
    ]);
    let vendorRepoCalled = false;
    (service as any)._vendorRepo = {
      find: async () => {
        vendorRepoCalled = true;
        return [];
      },
    };

    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async () => ({ ok: false }) as any;
    try {
      await (service as any).resolveBidded(section);
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(vendorRepoCalled).toBe(false);
  });
});

describe("LayoutResolverService.resolveBidded — product_carousel hydration", () => {
  const buildBidRepo = (winningBids: any[]) => ({
    createQueryBuilder: () => ({
      where: () => ({
        andWhere: () => ({
          andWhere: () => ({
            andWhere: () => ({
              orderBy: () => ({ take: () => ({ getMany: async () => winningBids }) }),
            }),
          }),
        }),
      }),
    }),
    findOne: async () => null,
  });

  test("merges product fields onto sponsored items and rewrites id to product_id", async () => {
    const service = new LayoutResolverService();
    const section: any = {
      id: "pc-1",
      bid_config: { slots: 2 },
      source_mode: SourceMode.bidded,
      section_type: { name: "product_carousel", scope: "platform" },
    };
    (service as any)._bidRepo = buildBidRepo([
      { id: "bid-1", vendor_id: "v-1", product_id: "p-1", content: null, bid_amount_fils: 5000 },
      { id: "bid-2", vendor_id: "v-2", product_id: "p-2", content: null, bid_amount_fils: 3000 },
    ]);

    let capturedUrl = "";
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: string) => {
      capturedUrl = url;
      return {
        ok: true,
        json: async () => ({
          data: {
            data: [
              {
                id: "p-1",
                name: "Product 1",
                slug: "product-1",
                price_min: 1000,
                price_max: 1000,
                images: ["a.jpg"],
              },
              {
                id: "p-2",
                name: "Product 2",
                slug: "product-2",
                price_min: 2000,
                price_max: 2000,
                images: ["b.jpg"],
              },
            ],
          },
        }),
      } as any;
    };
    try {
      const result = await (service as any).resolveBidded(section);
      expect(capturedUrl).toContain("/products?ids=");
      expect(capturedUrl).toContain("p-1");
      expect(capturedUrl).toContain("p-2");
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: "p-1",
        name: "Product 1",
        slug: "product-1",
        price_min: 1000,
        sponsored: true,
        bid_id: "bid-1",
        product_id: "p-1",
      });
      expect(result[1]).toMatchObject({
        id: "p-2",
        name: "Product 2",
        sponsored: true,
        bid_id: "bid-2",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("drops items whose product was not returned (deleted/unpublished)", async () => {
    const service = new LayoutResolverService();
    const section: any = {
      id: "pc-2",
      bid_config: { slots: 2 },
      source_mode: SourceMode.bidded,
      section_type: { name: "product_carousel", scope: "platform" },
    };
    (service as any)._bidRepo = buildBidRepo([
      { id: "bid-x", vendor_id: "v-1", product_id: "p-gone", content: null, bid_amount_fils: 1000 },
    ]);
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async () =>
      ({ ok: true, json: async () => ({ data: { data: [] } }) }) as any;
    try {
      const result = await (service as any).resolveBidded(section);
      expect(result).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("returns empty when product-service call fails (fail-soft)", async () => {
    const service = new LayoutResolverService();
    const section: any = {
      id: "pc-3",
      bid_config: { slots: 1 },
      source_mode: SourceMode.bidded,
      section_type: { name: "product_carousel", scope: "platform" },
    };
    (service as any)._bidRepo = buildBidRepo([
      { id: "bid-y", vendor_id: "v-1", product_id: "p-1", content: null, bid_amount_fils: 500 },
    ]);
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async () => {
      throw new Error("network down");
    };
    try {
      const result = await (service as any).resolveBidded(section);
      expect(result).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("LayoutResolverService.resolve — vendor context", () => {
  const baseSectionType = (name: string, scope: "platform" | "vendor" | "both" = "both") => ({
    id: `st-${name}`,
    name,
    scope,
  });

  const buildLayout = (overrides: Partial<any> = {}) => ({
    id: overrides.id ?? "layout-1",
    slug: overrides.slug ?? "vendor-storefront",
    vendor_id: overrides.vendor_id ?? "vendor-1",
    published_version_id: overrides.published_version_id ?? "ver-1",
    published_version: overrides.published_version ?? { version_number: 1 },
    ...overrides,
  });

  const buildSection = (overrides: Partial<any> = {}) => ({
    id: overrides.id ?? "sec-1",
    section_type: overrides.section_type ?? baseSectionType("product_carousel", "both"),
    position: overrides.position ?? 0,
    enabled: overrides.enabled ?? true,
    visibility: overrides.visibility ?? { mobile: true, web: true },
    targeting: overrides.targeting ?? null,
    settings: overrides.settings ?? {},
    source_mode: overrides.source_mode ?? "manual",
    blocks: overrides.blocks ?? [],
    data_source: overrides.data_source ?? null,
    ...overrides,
  });

  const buildVendor = () => ({
    id: "vendor-1",
    slug: "luxe-boards",
    name: "Luxe Boards",
    logo_url: "https://example.com/logo.png",
    banner_url: "https://example.com/banner.jpg",
  });

  test("returns owner='vendor' when vendor has a published layout", async () => {
    const service = new LayoutResolverService();
    const vendorLayout = buildLayout();
    (service as any)._vendorRepo = { findOne: async () => buildVendor() };
    (service as any)._layoutRepo = { findOne: async () => vendorLayout };
    (service as any)._sectionRepo = {
      find: async () => [buildSection()],
    };

    const result = await service.resolve("vendor-storefront", "en", "web", undefined, "vendor-1");
    expect(result.owner).toBe("vendor");
    expect(result.vendor_context?.id).toBe("vendor-1");
  });

  test("falls back to admin template when vendor has no published layout", async () => {
    const service = new LayoutResolverService();
    const adminTemplate = buildLayout({
      id: "tpl-1",
      slug: "vendor-default",
      vendor_id: null,
      published_version_id: "ver-tpl-1",
    });

    let lookupCount = 0;
    (service as any)._vendorRepo = { findOne: async () => buildVendor() };
    (service as any)._layoutRepo = {
      findOne: async (opts: any) => {
        lookupCount++;
        if (lookupCount === 1) {
          // First lookup: vendor-owned. Return null (no vendor layout).
          return null;
        }
        // Second lookup: admin template.
        expect(opts.where.slug).toBe("vendor-default");
        return adminTemplate;
      },
    };
    (service as any)._sectionRepo = { find: async () => [buildSection()] };

    const result = await service.resolve("vendor-storefront", "en", "web", undefined, "vendor-1");
    expect(result.owner).toBe("admin_template");
    expect(result.slug).toBe("vendor-default");
    expect(result.vendor_context?.id).toBe("vendor-1");
  });

  test("filters out platform-scope sections on vendor pages", async () => {
    const service = new LayoutResolverService();
    (service as any)._vendorRepo = { findOne: async () => buildVendor() };
    (service as any)._layoutRepo = { findOne: async () => buildLayout() };
    (service as any)._sectionRepo = {
      find: async () => [
        buildSection({
          id: "sec-keep",
          section_type: baseSectionType("product_carousel", "both"),
          position: 0,
        }),
        buildSection({
          id: "sec-drop",
          section_type: baseSectionType("vendor_showcase", "platform"),
          position: 1,
        }),
      ],
    };

    const result = await service.resolve("vendor-storefront", "en", "web", undefined, "vendor-1");
    expect(result.sections.map((s) => s.type)).toEqual(["product_carousel"]);
  });

  test("injects vendor_id into query-mode sections of allowed types", async () => {
    const service = new LayoutResolverService();
    (service as any)._vendorRepo = { findOne: async () => buildVendor() };
    (service as any)._layoutRepo = { findOne: async () => buildLayout() };
    (service as any)._sectionRepo = {
      find: async () => [
        buildSection({
          source_mode: "query",
          data_source: { type: "products", query: { limit: 5 } },
        }),
      ],
    };

    let capturedUrl = "";
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: string) => {
      capturedUrl = url;
      return { ok: true, json: async () => ({ data: [] }) } as any;
    };
    try {
      await service.resolve("vendor-storefront", "en", "web", undefined, "vendor-1");
      // /products expects camelCase `vendorId`; the resolver maps per-type.
      expect(capturedUrl).toContain("vendorId=vendor-1");
      expect(capturedUrl).toContain("limit=5");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("filters out unscopable query types on vendor pages (returns empty items)", async () => {
    const service = new LayoutResolverService();
    (service as any)._vendorRepo = { findOne: async () => buildVendor() };
    (service as any)._layoutRepo = { findOne: async () => buildLayout() };
    (service as any)._sectionRepo = {
      find: async () => [
        buildSection({
          source_mode: "query",
          data_source: { type: "brands", query: {} },
        }),
      ],
    };

    let fetchCalled = false;
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async () => {
      fetchCalled = true;
      return { ok: true, json: async () => ({ data: [] }) } as any;
    };
    try {
      const result = await service.resolve("vendor-storefront", "en", "web", undefined, "vendor-1");
      expect(fetchCalled).toBe(false);
      expect((result.sections[0]?.data as any).items ?? []).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("throws VENDOR_NOT_FOUND when vendor doesn't exist", async () => {
    const service = new LayoutResolverService();
    (service as any)._vendorRepo = { findOne: async () => null };
    (service as any)._layoutRepo = {
      findOne: async () => {
        throw new Error("Should not call layoutRepo when vendor missing");
      },
    };

    await expect(
      service.resolve("vendor-storefront", "en", "web", undefined, "vendor-1"),
    ).rejects.toMatchObject({ code: "VENDOR_NOT_FOUND" });
  });

  test("throws LAYOUT_NOT_PUBLISHED when vendor exists but no layout/template published", async () => {
    const service = new LayoutResolverService();
    (service as any)._vendorRepo = { findOne: async () => buildVendor() };
    (service as any)._layoutRepo = { findOne: async () => null };

    await expect(
      service.resolve("vendor-storefront", "en", "web", undefined, "vendor-1"),
    ).rejects.toMatchObject({ code: "LAYOUT_NOT_PUBLISHED" });
  });

  test("when contextVendorId absent, response has no owner/vendor_context fields", async () => {
    const service = new LayoutResolverService();
    (service as any)._layoutRepo = {
      findOne: async () => buildLayout({ vendor_id: null, slug: "homepage" }),
    };
    (service as any)._sectionRepo = { find: async () => [] };

    const result = await service.resolve("homepage", "en", "web");
    expect((result as any).owner).toBeUndefined();
    expect((result as any).vendor_context).toBeUndefined();
  });
});

describe("LayoutResolverService.resolveQuery — brand_spotlight type", () => {
  test("hits the product-service /brands/spotlight URL with limit param", async () => {
    const service = new LayoutResolverService();
    const fetched: string[] = [];
    const fakeFetch = (url: string) => {
      fetched.push(url);
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: [{ id: "b1", slug: "b1", top_products: [] }] }),
      });
    };
    const restore = globalThis.fetch;
    (globalThis as any).fetch = fakeFetch;
    try {
      const items = await (service as any).resolveQuery({
        type: "brand_spotlight",
        query: { limit: 8 },
      });
      expect(fetched).toHaveLength(1);
      expect(fetched[0]).toContain("/brands/spotlight");
      expect(fetched[0]).toContain("limit=8");
      expect(items).toHaveLength(1);
    } finally {
      (globalThis as any).fetch = restore;
    }
  });
});

describe("LayoutResolverService.resolveQuery collection type", () => {
  test("hits the product-service collection endpoint and returns its items", async () => {
    const service = new LayoutResolverService();
    const fetched: string[] = [];
    const restore = globalThis.fetch;
    (globalThis as any).fetch = async (url: string) => {
      fetched.push(url);
      return {
        ok: true,
        json: async () => ({
          data: {
            collection: { id: "c1", name: "Summer Picks", slug: "summer-picks" },
            items: [{ id: "p1", name: "Product 1" }],
            total: 1,
          },
        }),
      } as any;
    };

    try {
      const items = await (service as any).resolveQuery({
        type: "collection",
        query: { collection_slug: "summer-picks", limit: 12, sort: "custom" },
      });

      expect(fetched).toHaveLength(1);
      expect(fetched[0]).toContain("/collections/summer-picks");
      expect(fetched[0]).toContain("perPage=12");
      expect(fetched[0]).toContain("sort=custom");
      expect(items).toEqual([{ id: "p1", name: "Product 1" }]);
    } finally {
      (globalThis as any).fetch = restore;
    }
  });
});

describe("LayoutResolverService.resolveSection — collection_slug exposure", () => {
  const buildSection = (overrides: any = {}) => ({
    id: overrides.id ?? "sec-1",
    section_type: overrides.section_type ?? { name: "product_carousel" },
    position: overrides.position ?? 0,
    settings: overrides.settings ?? {},
    source_mode: overrides.source_mode ?? "query",
    blocks: overrides.blocks ?? [],
    data_source: overrides.data_source ?? null,
    ...overrides,
  });

  const withStubbedFetch = async (fn: () => Promise<any>) => {
    const restore = globalThis.fetch;
    (globalThis as any).fetch = async () =>
      ({ ok: true, json: async () => ({ data: { items: [] } }) }) as any;
    try {
      return await fn();
    } finally {
      (globalThis as any).fetch = restore;
    }
  };

  test("surfaces the slug so the storefront can link View all at the collection", async () => {
    const service = new LayoutResolverService();
    const resolved = await withStubbedFetch(() =>
      (service as any).resolveSection(
        buildSection({
          data_source: { type: "collection", query: { collection_slug: "summer-picks" } },
        }),
      ),
    );
    expect(resolved.collection_slug).toBe("summer-picks");
  });

  test("omits the slug for non-collection sections", async () => {
    const service = new LayoutResolverService();
    const resolved = await withStubbedFetch(() =>
      (service as any).resolveSection(
        buildSection({ data_source: { type: "products", query: { limit: 5 } } }),
      ),
    );
    expect(resolved.collection_slug).toBeUndefined();
  });

  test("does not leak the rest of data_source to the storefront", async () => {
    const service = new LayoutResolverService();
    const resolved = await withStubbedFetch(() =>
      (service as any).resolveSection(
        buildSection({
          data_source: { type: "collection", query: { collection_slug: "summer-picks" } },
        }),
      ),
    );
    expect(resolved.data_source).toBeUndefined();
  });
});

describe("manual product_carousel picks", () => {
  const a = "0b8f7c56-6c5f-4b6a-9d7e-2a1b3c4d5e6f";
  const b = "1c9f7c56-6c5f-4b6a-9d7e-2a1b3c4d5e70";

  test("reads product ids in order, skipping junk and duplicates", () => {
    const blocks = [
      { id: "x", type: "product", data: { product_id: b } },
      { id: "y", type: "product", data: { product_id: "not-a-uuid" } },
      { id: "z", type: "product", data: { product_id: a } },
      { id: "w", type: "product", data: { product_id: b } },
      null,
    ];
    expect(manualProductIds(blocks)).toEqual([b, a]);
    expect(manualProductIds(undefined)).toEqual([]);
  });

  test("keeps the picked order and drops products that didn't resolve", () => {
    const items = [{ id: a, name: "Greyboard 2 mm" }, { id: "other" }];
    expect(orderByIds(items, [b, a])).toEqual([{ id: a, name: "Greyboard 2 mm" }]);
  });

  test("resolveSection fills data.items for a manual product_carousel", async () => {
    const service = new LayoutResolverService();
    (service as any).resolveManualProducts = async (blocks: unknown) =>
      manualProductIds(blocks).map((id: string) => ({ id }));
    const section: any = {
      id: "s1",
      position: 0,
      settings: {},
      source_mode: SourceMode.manual,
      section_type: { name: "product_carousel" },
      blocks: [{ id: "p", type: "product", data: { product_id: a } }],
      data_source: null,
    };
    const resolved = await (service as any).resolveSection(section);
    expect(resolved.data.items).toEqual([{ id: a }]);
    expect(resolved.data.blocks).toHaveLength(1);
  });
});
