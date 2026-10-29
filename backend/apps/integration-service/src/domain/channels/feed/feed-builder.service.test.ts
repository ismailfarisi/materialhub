import { describe, expect, it } from "bun:test";
import { type FeedBuildContext, productToFeedItems } from "./feed-builder.service.ts";

function ctx(over: Partial<FeedBuildContext> = {}): FeedBuildContext {
  return {
    webBaseUrl: "https://materialhubuae.com",
    categoryMap: new Map(),
    availability: new Map(),
    excludedOfferIds: new Set(),
    ...over,
  };
}

function baseProduct(over: Record<string, unknown> = {}): any {
  return {
    id: "p1",
    slug: "rose-serum",
    name: "Rose Serum",
    description: "A hydrating rose serum.",
    price: 12000,
    compare_at_price: null,
    currency: "AED",
    status: "published",
    is_digital: false,
    is_age_restricted: false,
    track_inventory: true,
    allow_backorder: false,
    has_variants: false,
    barcode: "1234567890123",
    mpn: null,
    country_of_origin: "AE",
    category_id: "cat1",
    vendor: { status: "approved", exclude_from_channel_feeds: false },
    brand: { name: "Lumina" },
    images: [{ url: "https://cdn/x.jpg", is_primary: true, sort_order: 0 }],
    variants: [],
    ...over,
  };
}

describe("productToFeedItems — simple product", () => {
  it("maps a published in-stock product to one item", () => {
    const r = productToFeedItems(baseProduct(), ctx({ availability: new Map([["p1", 5]]) }));
    expect(r.skippedCount).toBe(0);
    expect(r.excludedCount).toBe(0);
    expect(r.items).toHaveLength(1);
    const item = r.items[0]!;
    expect(item.offer_id).toBe("p1");
    expect(item.item_group_id).toBeNull();
    expect(item.title).toBe("Rose Serum");
    expect(item.link).toBe("https://materialhubuae.com/en/product/rose-serum");
    expect(item.image_link).toBe("https://cdn/x.jpg");
    expect(item.availability).toBe("in_stock");
    expect(item.price_fils).toBe(12000);
    expect(item.sale_price_fils).toBeNull();
    expect(item.brand).toBe("Lumina");
    expect(item.gtin).toBe("1234567890123");
    expect(item.identifier_exists).toBe(true);
    expect(item.condition).toBe("new");
  });
});

describe("productToFeedItems — pricing", () => {
  it("uses compare_at_price as regular price and price as sale price", () => {
    const r = productToFeedItems(
      baseProduct({ price: 9000, compare_at_price: 12000 }),
      ctx({ availability: new Map([["p1", 5]]) }),
    );
    expect(r.items[0]!.price_fils).toBe(12000);
    expect(r.items[0]!.sale_price_fils).toBe(9000);
  });
});

describe("productToFeedItems — availability", () => {
  it("is out_of_stock when tracked, zero qty, no backorder", () => {
    const r = productToFeedItems(baseProduct(), ctx({ availability: new Map([["p1", 0]]) }));
    expect(r.items[0]!.availability).toBe("out_of_stock");
  });

  it("is in_stock when inventory is not tracked", () => {
    const r = productToFeedItems(baseProduct({ track_inventory: false }), ctx());
    expect(r.items[0]!.availability).toBe("in_stock");
  });
});

describe("productToFeedItems — policy drops (silent, no counts)", () => {
  it("drops digital products", () => {
    const r = productToFeedItems(baseProduct({ is_digital: true }), ctx());
    expect(r.items).toHaveLength(0);
    expect(r.skippedCount).toBe(0);
  });

  it("drops age-restricted products", () => {
    const r = productToFeedItems(baseProduct({ is_age_restricted: true }), ctx());
    expect(r.items).toHaveLength(0);
  });

  it("drops products of a vendor that opted out", () => {
    const r = productToFeedItems(
      baseProduct({ vendor: { status: "approved", exclude_from_channel_feeds: true } }),
      ctx(),
    );
    expect(r.items).toHaveLength(0);
  });

  it("drops products of a non-approved vendor", () => {
    const r = productToFeedItems(
      baseProduct({ vendor: { status: "suspended", exclude_from_channel_feeds: false } }),
      ctx(),
    );
    expect(r.items).toHaveLength(0);
  });
});

describe("productToFeedItems — data-quality skips", () => {
  it("skips a product with no image", () => {
    const r = productToFeedItems(baseProduct({ images: [] }), ctx());
    expect(r.items).toHaveLength(0);
    expect(r.skippedCount).toBe(1);
  });

  it("skips a product with no description", () => {
    const r = productToFeedItems(baseProduct({ description: null }), ctx());
    expect(r.skippedCount).toBe(1);
  });

  it("skips a product with non-positive price", () => {
    const r = productToFeedItems(baseProduct({ price: 0 }), ctx());
    expect(r.skippedCount).toBe(1);
  });
});

describe("productToFeedItems — admin exclusion", () => {
  it("excludes an offer whose id is in excludedOfferIds", () => {
    const r = productToFeedItems(
      baseProduct(),
      ctx({ excludedOfferIds: new Set(["p1"]), availability: new Map([["p1", 5]]) }),
    );
    expect(r.items).toHaveLength(0);
    expect(r.excludedCount).toBe(1);
  });
});

describe("productToFeedItems — category mapping", () => {
  it("fills google_product_category and product_type from the map", () => {
    const r = productToFeedItems(
      baseProduct(),
      ctx({
        availability: new Map([["p1", 5]]),
        categoryMap: new Map([["cat1", { externalId: "499676", path: "Beauty > Skincare" }]]),
      }),
    );
    expect(r.items[0]!.google_product_category).toBe("499676");
    expect(r.items[0]!.product_type).toBe("Beauty > Skincare");
  });
});

describe("productToFeedItems — variants", () => {
  it("emits one item per active variant with item_group_id", () => {
    const product = baseProduct({
      has_variants: true,
      variants: [
        { id: "v1", price: 10000, compare_at_price: null, barcode: "111", is_active: true },
        { id: "v2", price: 11000, compare_at_price: null, barcode: "222", is_active: true },
        { id: "v3", price: 12000, compare_at_price: null, barcode: "333", is_active: false },
      ],
    });
    const r = productToFeedItems(
      product,
      ctx({
        availability: new Map([
          ["v1", 3],
          ["v2", 0],
        ]),
      }),
    );
    expect(r.items).toHaveLength(2);
    expect(r.items.map((i) => i.offer_id).sort()).toEqual(["v1", "v2"]);
    expect(r.items[0]!.item_group_id).toBe("p1");
    const v2 = r.items.find((i) => i.offer_id === "v2")!;
    expect(v2.availability).toBe("out_of_stock");
    expect(v2.price_fils).toBe(11000);
  });
});

describe("productToFeedItems — identifier_exists", () => {
  it("is false when there is no gtin and not both brand and mpn", () => {
    const r = productToFeedItems(
      baseProduct({ barcode: null, mpn: null }),
      ctx({ availability: new Map([["p1", 5]]) }),
    );
    expect(r.items[0]!.identifier_exists).toBe(false);
  });
});

describe("productToFeedItems — variant product with no active variants", () => {
  it("emits nothing (no items, no counts) when has_variants is true but variants is empty", () => {
    const r = productToFeedItems(baseProduct({ has_variants: true, variants: [] }), ctx());
    expect(r.items).toHaveLength(0);
    expect(r.skippedCount).toBe(0);
    expect(r.excludedCount).toBe(0);
  });
});

describe("productToFeedItems — missing vendor relation", () => {
  it("drops a product whose vendor relation is null", () => {
    const r = productToFeedItems(baseProduct({ vendor: null }), ctx());
    expect(r.items).toHaveLength(0);
  });
});
