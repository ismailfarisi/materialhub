import { describe, expect, it } from "bun:test";
import type { ChannelListing } from "@materialhub/database";
import type { FeedItem } from "./feed-item.ts";
import { computeContentHash, diffEligibleVsExisting } from "./listings-sync.ts";

const baseItem = (overrides: Partial<FeedItem> = {}): FeedItem => ({
  offer_id: "a",
  item_group_id: null,
  title: "t",
  description: "d",
  link: "https://x",
  image_link: "https://x.jpg",
  additional_image_links: [],
  availability: "in_stock",
  price_fils: 100,
  sale_price_fils: null,
  currency: "AED",
  brand: null,
  gtin: null,
  mpn: null,
  condition: "new",
  google_product_category: null,
  product_type: null,
  country_of_origin: null,
  identifier_exists: false,
  ...overrides,
});

const row = (offerId: string, hash: string | null = null): ChannelListing =>
  ({ offer_id: offerId, content_hash: hash }) as unknown as ChannelListing;

describe("computeContentHash", () => {
  it("returns the same hash for identical items", () => {
    expect(computeContentHash(baseItem())).toBe(computeContentHash(baseItem()));
  });

  it("differs when any field changes", () => {
    expect(computeContentHash(baseItem())).not.toBe(
      computeContentHash(baseItem({ price_fils: 101 })),
    );
  });

  it("ignores object-key insertion order", () => {
    const a = baseItem({ brand: "x", gtin: "y" });
    const b: FeedItem = { ...baseItem(), gtin: "y", brand: "x" };
    expect(computeContentHash(a)).toBe(computeContentHash(b));
  });
});

describe("diffEligibleVsExisting", () => {
  it("treats new offer_ids as upserts with prevHash=null", () => {
    const r = diffEligibleVsExisting([baseItem({ offer_id: "a" })], []);
    expect(r.upserts).toHaveLength(1);
    expect(r.upserts[0]?.prevHash).toBeNull();
    expect(r.removed).toHaveLength(0);
  });

  it("marks unchanged when hash matches", () => {
    const item = baseItem({ offer_id: "a" });
    const hash = computeContentHash(item);
    const r = diffEligibleVsExisting([item], [row("a", hash)]);
    expect(r.upserts).toHaveLength(0);
    expect(r.unchanged).toHaveLength(1);
  });

  it("emits upsert when hash differs", () => {
    const item = baseItem({ offer_id: "a", price_fils: 500 });
    const r = diffEligibleVsExisting([item], [row("a", "stale-hash")]);
    expect(r.upserts).toHaveLength(1);
    expect(r.upserts[0]?.prevHash).toBe("stale-hash");
  });

  it("marks rows not in the eligible set as removed", () => {
    const item = baseItem({ offer_id: "a" });
    const r = diffEligibleVsExisting(
      [item],
      [row("a", computeContentHash(item)), row("ghost", "h")],
    );
    expect(r.removed).toHaveLength(1);
    expect(r.removed[0]?.offer_id).toBe("ghost");
  });
});
