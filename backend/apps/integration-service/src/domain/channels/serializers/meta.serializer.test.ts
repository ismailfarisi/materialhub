import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FeedItem } from "../feed/feed-item.ts";
import { feedItemsToMetaXml } from "./meta.serializer.ts";

const golden = readFileSync(join(import.meta.dir, "__fixtures__/meta-sample.xml"), "utf8");
const normalizeNewlines = (value: string) => value.replace(/\r\n/g, "\n");

const items: FeedItem[] = [
  {
    offer_id: "prod-1",
    item_group_id: null,
    title: "Rose Eau de Parfum",
    description: "A floral fragrance.",
    link: "https://materialhubuae.com/en/product/rose-edp",
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
    link: "https://materialhubuae.com/en/product/matte-lipstick",
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

describe("feedItemsToMetaXml", () => {
  it("matches the golden fixture", () => {
    const out = feedItemsToMetaXml(items, {
      title: "MaterialHub",
      link: "https://materialhubuae.com",
      description: "MaterialHub marketplace catalog",
    });
    expect(normalizeNewlines(out)).toBe(normalizeNewlines(golden));
  });

  it("emits identifier_exists as uppercase YES/NO (Meta spec, distinct from Google's yes/no)", () => {
    const out = feedItemsToMetaXml(items, {
      title: "t",
      link: "l",
      description: "d",
    });
    expect(out).toContain("<g:identifier_exists>NO</g:identifier_exists>");
    expect(out).toContain("<g:identifier_exists>YES</g:identifier_exists>");
  });

  it("escapes ampersand and angle brackets in product_type", () => {
    const out = feedItemsToMetaXml([{ ...lipstickItem, product_type: "A & B < C > D" }], {
      title: "t",
      link: "l",
      description: "d",
    });
    expect(out).toContain("A &amp; B &lt; C &gt; D");
  });

  it("escapes embedded `]]>` inside description CDATA", () => {
    const out = feedItemsToMetaXml([{ ...roseItem, description: "foo ]]> bar" }], {
      title: "t",
      link: "l",
      description: "d",
    });
    expect(out).toContain("<![CDATA[foo ]]]]><![CDATA[> bar]]>");
  });

  it("emits empty channel block when items is empty", () => {
    const out = feedItemsToMetaXml([], {
      title: "t",
      link: "l",
      description: "d",
    });
    expect(out).toContain("<channel>");
    expect(out).toContain("</channel>");
    expect(out).not.toContain("<item>");
  });
});
