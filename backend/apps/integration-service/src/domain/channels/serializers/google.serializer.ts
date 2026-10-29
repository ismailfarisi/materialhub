import type { FeedItem } from "../feed/feed-item.ts";
import { cdata, escapeXml } from "./xml.ts";

export interface GoogleRssChannel {
  title: string;
  link: string;
  description: string;
}

const G_NS = "http://base.google.com/ns/1.0";

function price(fils: number, currency: string): string {
  return `${(fils / 100).toFixed(2)} ${currency}`;
}

function tag(name: string, value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  return `      <${name}>${escapeXml(value)}</${name}>\n`;
}

function gtag(name: string, value: string | null | undefined): string {
  return tag(`g:${name}`, value);
}

function serializeItem(item: FeedItem): string {
  const lines: string[] = [];
  lines.push("    <item>");
  lines.push(`      <g:id>${escapeXml(item.offer_id)}</g:id>`);
  if (item.item_group_id) {
    lines.push(`      <g:item_group_id>${escapeXml(item.item_group_id)}</g:item_group_id>`);
  }
  lines.push(`      <title>${cdata(item.title)}</title>`);
  lines.push(`      <description>${cdata(item.description)}</description>`);
  lines.push(`      <link>${escapeXml(item.link)}</link>`);
  lines.push(`      <g:image_link>${escapeXml(item.image_link)}</g:image_link>`);
  for (const url of item.additional_image_links) {
    lines.push(`      <g:additional_image_link>${escapeXml(url)}</g:additional_image_link>`);
  }
  const availability = item.availability === "in_stock" ? "in stock" : "out of stock";
  lines.push(`      <g:availability>${availability}</g:availability>`);
  lines.push(`      <g:price>${price(item.price_fils, item.currency)}</g:price>`);
  if (item.sale_price_fils != null) {
    lines.push(`      <g:sale_price>${price(item.sale_price_fils, item.currency)}</g:sale_price>`);
  }
  lines.push(gtag("brand", item.brand).trimEnd());
  lines.push(gtag("gtin", item.gtin).trimEnd());
  lines.push(gtag("mpn", item.mpn).trimEnd());
  lines.push(
    `      <g:identifier_exists>${item.identifier_exists ? "yes" : "no"}</g:identifier_exists>`,
  );
  lines.push(`      <g:condition>${item.condition}</g:condition>`);
  lines.push(gtag("google_product_category", item.google_product_category).trimEnd());
  lines.push(gtag("product_type", item.product_type).trimEnd());
  lines.push("    </item>");
  return lines.filter((l) => l !== "").join("\n");
}

export function feedItemsToGoogleRss(items: FeedItem[], channel: GoogleRssChannel): string {
  const itemsXml = items.map(serializeItem).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="${G_NS}">
  <channel>
    <title>${escapeXml(channel.title)}</title>
    <link>${escapeXml(channel.link)}</link>
    <description>${escapeXml(channel.description)}</description>
${itemsXml}
  </channel>
</rss>
`;
}
