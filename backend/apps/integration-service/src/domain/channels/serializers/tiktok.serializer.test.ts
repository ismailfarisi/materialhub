import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FeedItem } from "../feed/feed-item.ts";
import { feedItemsToTiktokXml } from "./tiktok.serializer.ts";

const SAMPLE_CHANNEL = {
  title: "MaterialHub",
  link: "https://materialhubuae.com/en",
  description: "MaterialHub marketplace catalog",
};

const MINIMAL_ITEM: FeedItem = {
  offer_id: "SKU-001",
  item_group_id: null,
  title: "Argan Oil 50ml",
  description: "Pure Moroccan argan oil.",
  link: "https://materialhubuae.com/en/products/argan-oil-50ml",
  image_link: "https://cdn.materialhubuae.com/argan.jpg",
  additional_image_links: [],
  availability: "in_stock",
  price_fils: 12950,
  sale_price_fils: null,
  currency: "AED",
  brand: null,
  gtin: null,
  mpn: null,
  identifier_exists: false,
  condition: "new",
  google_product_category: null,
  product_type: null,
  country_of_origin: null,
};

describe("feedItemsToTiktokXml", () => {
  it("emits RSS 2.0 + g: namespace envelope with minimal item", () => {
    const xml = feedItemsToTiktokXml([MINIMAL_ITEM], SAMPLE_CHANNEL);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">');
    expect(xml).toContain("<title>MaterialHub</title>");
    expect(xml).toContain("<g:id>SKU-001</g:id>");
    expect(xml).toContain("<g:price>129.50 AED</g:price>");
    expect(xml).toContain("<g:availability>in stock</g:availability>");
    expect(xml).toContain("</rss>");
  });
});

describe("feedItemsToTiktokXml extras", () => {
  it("XML-escapes link special characters and preserves title chars inside CDATA", () => {
    const item: FeedItem = {
      ...MINIMAL_ITEM,
      title: "A & B < C > D",
      description: "Quote: \"hello\" 'world'",
      link: "https://materialhubuae.com/p?q=1&r=2",
      product_type: "A & B < C > D",
    };
    const xml = feedItemsToTiktokXml([item], SAMPLE_CHANNEL);
    // `link` is emitted via escapeXml — ampersand becomes &amp;.
    expect(xml).toContain("https://materialhubuae.com/p?q=1&amp;r=2");
    // `product_type` is emitted via gtag (escapeXml) — special chars escaped.
    expect(xml).toContain("<g:product_type>A &amp; B &lt; C &gt; D</g:product_type>");
    // `title` is wrapped in CDATA — special chars preserved literally (matches
    // Meta serializer behavior; this is the entire point of CDATA).
    expect(xml).toContain("<![CDATA[A & B < C > D]]>");
  });

  it("emits all optional fields when present (variant w/ group, brand, gtin, sale, etc.)", () => {
    const item: FeedItem = {
      ...MINIMAL_ITEM,
      offer_id: "SKU-001-V1",
      item_group_id: "SKU-001",
      additional_image_links: [
        "https://cdn.materialhubuae.com/argan-2.jpg",
        "https://cdn.materialhubuae.com/argan-3.jpg",
      ],
      sale_price_fils: 9950,
      brand: "Noor",
      gtin: "0123456789012",
      mpn: "NL-ARG-50",
      identifier_exists: true,
      google_product_category: "469",
      product_type: "Beauty > Skincare > Oils",
    };
    const xml = feedItemsToTiktokXml([item], SAMPLE_CHANNEL);
    expect(xml).toContain("<g:item_group_id>SKU-001</g:item_group_id>");
    expect(xml).toContain(
      "<g:additional_image_link>https://cdn.materialhubuae.com/argan-2.jpg</g:additional_image_link>",
    );
    expect(xml).toContain(
      "<g:additional_image_link>https://cdn.materialhubuae.com/argan-3.jpg</g:additional_image_link>",
    );
    expect(xml).toContain("<g:sale_price>99.50 AED</g:sale_price>");
    expect(xml).toContain("<g:brand>Noor</g:brand>");
    expect(xml).toContain("<g:gtin>0123456789012</g:gtin>");
    expect(xml).toContain("<g:mpn>NL-ARG-50</g:mpn>");
    expect(xml).toContain("<g:google_product_category>469</g:google_product_category>");
    expect(xml).toContain("<g:product_type>Beauty &gt; Skincare &gt; Oils</g:product_type>");
  });

  it("emits empty channel body when items array is empty (no stray blank line)", () => {
    const xml = feedItemsToTiktokXml([], SAMPLE_CHANNEL);
    expect(xml).toContain("<description>MaterialHub marketplace catalog</description>\n  </channel>");
    expect(xml).not.toContain("    <item>");
  });

  it("preserves item ordering (first item first in output)", () => {
    const a: FeedItem = { ...MINIMAL_ITEM, offer_id: "AAA-1" };
    const b: FeedItem = { ...MINIMAL_ITEM, offer_id: "BBB-2" };
    const xml = feedItemsToTiktokXml([a, b], SAMPLE_CHANNEL);
    const aIdx = xml.indexOf("<g:id>AAA-1</g:id>");
    const bIdx = xml.indexOf("<g:id>BBB-2</g:id>");
    expect(aIdx).toBeGreaterThan(0);
    expect(bIdx).toBeGreaterThan(aIdx);
  });

  it("matches the golden fixture byte-for-byte (LF, two items)", () => {
    const fixturePath = join(__dirname, "__fixtures__", "tiktok-sample.xml");
    const expected = readFileSync(fixturePath, "utf8").replace(/\r\n/g, "\n");
    const items: FeedItem[] = [
      MINIMAL_ITEM,
      {
        ...MINIMAL_ITEM,
        offer_id: "SKU-002",
        title: "Rose Water 100ml",
        description: "Damascus rose water toner.",
        link: "https://materialhubuae.com/en/products/rose-water-100ml",
        image_link: "https://cdn.materialhubuae.com/rose.jpg",
        price_fils: 4500,
        brand: "Noor",
      },
    ];
    const actual = feedItemsToTiktokXml(items, SAMPLE_CHANNEL).replace(/\r\n/g, "\n");
    expect(actual).toBe(expected);
  });
});
