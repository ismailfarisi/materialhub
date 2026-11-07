/**
 * Public (storefront) product detail shape. The detail queries load the full
 * Vendor and Inventory entities; sent as-is they exposed the vendor's Stripe
 * account id, commission rate/tiers, total sales, payout settings, rejection
 * reason, verifier ids and trade licence number, plus warehouse ids and stock
 * internals, to anonymous callers. Only display fields leave the server.
 */

const PUBLIC_VENDOR_FIELDS = [
  "id",
  "name",
  "slug",
  "business_name",
  "description",
  "story",
  "logo_url",
  "banner_url",
  "cover_images",
  "rating_avg",
  "rating_count",
  "follower_count",
  "processing_time_days",
  "response_time_hours",
  "return_policy",
  "shipping_policy",
  "verified_at",
  "founded_year",
  "website_url",
  "social_links",
] as const;

export function toPublicVendor(vendor: Record<string, unknown> | null | undefined) {
  if (!vendor) return null;
  const out: Record<string, unknown> = {};
  for (const k of PUBLIC_VENDOR_FIELDS) if (k in vendor) out[k] = vendor[k];
  return out;
}

/** Per-row availability only: no warehouse ids, thresholds or reserved counts. */
export function toPublicInventory(rows: unknown) {
  if (!Array.isArray(rows)) return [];
  return rows.map((r: any) => ({
    variant_id: r?.variant_id ?? null,
    quantity_available: Math.max(
      0,
      Number(r?.quantity_on_hand ?? 0) - Number(r?.quantity_reserved ?? 0),
    ),
  }));
}

export function toPublicProductDetail<T extends Record<string, any>>(product: T): T {
  (product as any).vendor = toPublicVendor(product.vendor);
  (product as any).inventoryRecords = toPublicInventory(product.inventoryRecords);
  return product;
}

const TRANSLATED_FIELDS = [
  "name",
  "short_description",
  "description",
  "rich_description",
  "ingredients",
  "usage_instructions",
  "meta_title",
  "meta_description",
] as const;

/**
 * Overlay a product translation (e.g. "ar") on the English product. Blank
 * translated fields keep the English value, so a partial translation never
 * blanks the page.
 */
export function applyProductTranslation<T extends Record<string, any>>(
  product: T,
  translation: Record<string, unknown> | null | undefined,
): T {
  if (!translation) return product;
  for (const f of TRANSLATED_FIELDS) {
    const v = translation[f];
    if (v == null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    (product as any)[f] = v;
  }
  return product;
}
