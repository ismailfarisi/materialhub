import { describe, expect, it } from "bun:test";
import { FeedBuilderService } from "./feed-builder.service.ts";

function product(id: string): any {
  return {
    id,
    slug: `product-${id}`,
    name: `Product ${id}`,
    description: "Feed eligible product.",
    price: 12000,
    compare_at_price: null,
    currency: "AED",
    is_digital: false,
    is_age_restricted: false,
    track_inventory: false,
    allow_backorder: false,
    has_variants: false,
    barcode: `${id}123456789`,
    mpn: null,
    country_of_origin: "AE",
    category_id: "cat1",
    vendor: { status: "approved", exclude_from_channel_feeds: false },
    brand: { name: "MaterialHub" },
    images: [{ url: `https://cdn.materialhubuae.com/${id}.jpg`, is_primary: true, sort_order: 0 }],
    variants: [],
    inventoryRecords: [],
  };
}

describe("FeedBuilderService.build", () => {
  it("loads eligible products in bounded batches", async () => {
    const products = [product("p1"), product("p2"), product("p3")];
    const calls: any[] = [];
    const repo = {
      find: async (opts: any) => {
        calls.push(opts);
        return products.slice(opts.skip, opts.skip + opts.take);
      },
    };
    const service = new FeedBuilderService(repo as any, "https://materialhubuae.com", 2);

    const result = await service.build({} as any, new Map(), new Set());

    expect(result.itemCount).toBe(3);
    expect(calls.map((call) => [call.skip, call.take])).toEqual([
      [0, 2],
      [2, 2],
    ]);
    expect(calls.every((call) => call.relations.includes("inventoryRecords"))).toBe(true);
  });
});
