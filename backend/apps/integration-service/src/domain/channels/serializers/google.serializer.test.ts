import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FeedItem } from "../feed/feed-item.ts";
import { feedItemsToGoogleRss } from "./google.serializer.ts";

const golden = readFileSync(join(import.meta.dir, "__fixtures__/google-sample.xml"), "utf8");
const normalizeNewlines = (value: string) => value.replace(/\r\n/g, "\n");

const items: FeedItem[] = [
  {
    offer_id: "prod-1",
    item_group_id: null,
    title: "Rose Eau de Parfum",
    description: "A floral fragrance.",
    link: "https://www.materialhubuae.com/en/product/rose-edp",
    image_link: "https://cdn.materialhubuae.com/p/1/a.jpg",
    additional_image_links: [],
    availability: "in_stock",
    price_fils: 12000,
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
  },
  {
    offer_id: "var-1",
    item_group_id: "prod-2",
    title: "Matte Lipstick — Crimson",
    description: "Long-wear matte finish.",
    link: "https://www.materialhubuae.com/en/product/matte-lipstick",
    image_link: "https://cdn.materialhubuae.com/p/2/a.jpg",
    additional_image_links: ["https://cdn.materialhubuae.com/p/2/b.jpg"],
    availability: "out_of_stock",
    price_fils: 8500,
    sale_price_fils: 6900,
    currency: "AED",
    brand: "LuxeBeauty",
    gtin: "0123456789012",
    mpn: "LB-MATTE-CR",
    condition: "new",
    google_product_category: "567",
    product_type: "Health & Beauty > Makeup > Lipstick",
    country_of_origin: null,
    identifier_exists: true,
  },
];
const roseItem = items[0];
const lipstickItem = items[1];
if (!roseItem || !lipstickItem) throw new Error("Expected feed test items");

describe("feedItemsToGoogleRss", () => {
  it("matches the golden fixture", () => {
    const out = feedItemsToGoogleRss(items, {
      title: "MaterialHub",
      link: "https://www.materialhubuae.com",
      description: "MaterialHub marketplace catalog",
    });
    expect(normalizeNewlines(out)).toBe(normalizeNewlines(golden));
  });

  it("escapes ampersand and angle brackets in product_type", () => {
    const out = feedItemsToGoogleRss([{ ...lipstickItem, product_type: "A & B < C" }], {
      title: "t",
      link: "l",
      description: "d",
    });
    expect(out).toContain("A &amp; B &lt; C");
  });

  it("escapes embedded `]]>` inside description CDATA", () => {
    const out = feedItemsToGoogleRss([{ ...roseItem, description: "foo ]]> bar" }], {
      title: "t",
      link: "l",
      description: "d",
    });
    expect(out).toContain("<![CDATA[foo ]]]]><![CDATA[> bar]]>");
  });

  it("emits zero items when given an empty array", () => {
    const out = feedItemsToGoogleRss([], {
      title: "t",
      link: "l",
      description: "d",
    });
    expect(out).toContain("<channel>");
    expect(out).not.toContain("<item>");
  });
});
