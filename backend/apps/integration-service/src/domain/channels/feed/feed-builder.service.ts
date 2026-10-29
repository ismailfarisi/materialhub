import { type Product, ProductStatus, type SalesChannel } from "@materialhub/database";
import { IsNull, Not, type Repository } from "typeorm";
import type { FeedItem } from "./feed-item.ts";

export interface FeedBuildContext {
  webBaseUrl: string;
  /** category_id → channel taxonomy. */
  categoryMap: Map<string, { externalId: string; path: string | null }>;
  /** offer_id (product id or variant id) → available quantity. */
  availability: Map<string, number>;
  /** offer_ids the admin has excluded for this channel. */
  excludedOfferIds: Set<string>;
}

export interface ProductFeedResult {
  items: FeedItem[];
  excludedCount: number;
  skippedCount: number;
}

export interface FeedBuildResult {
  items: FeedItem[];
  itemCount: number;
  excludedCount: number;
  skippedCount: number;
}

function availabilityFor(
  offerId: string,
  product: any,
  ctx: FeedBuildContext,
): FeedItem["availability"] {
  if (!product.track_inventory || product.allow_backorder) return "in_stock";
  return (ctx.availability.get(offerId) ?? 0) > 0 ? "in_stock" : "out_of_stock";
}

/** Pure: maps one fully-hydrated product (with `vendor`, `brand`, `images`,
 *  `variants` loaded) to its feed items. No I/O. */
export function productToFeedItems(product: any, ctx: FeedBuildContext): ProductFeedResult {
  // Policy drops — silent, not counted.
  if (product.is_digital || product.is_age_restricted) {
    return { items: [], excludedCount: 0, skippedCount: 0 };
  }
  const vendor = product.vendor;
  if (!vendor || vendor.status !== "approved" || vendor.exclude_from_channel_feeds) {
    return { items: [], excludedCount: 0, skippedCount: 0 };
  }

  const images = [...(product.images ?? [])].sort(
    (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  const primary = images.find((i: any) => i.is_primary) ?? images[0];
  const description: string | null = product.description ?? null;
  const category = ctx.categoryMap.get(product.category_id);
  const brand: string | null = product.brand?.name ?? null;
  const link = `${ctx.webBaseUrl}/en/product/${product.slug}`;
  const currency: string = product.currency ?? "AED";

  const result: ProductFeedResult = { items: [], excludedCount: 0, skippedCount: 0 };

  const buildItem = (args: {
    offerId: string;
    itemGroupId: string | null;
    price: number;
    compareAt: number | null;
    gtin: string | null;
  }): FeedItem | "skip" | "exclude" => {
    // Admin exclusion takes priority over data-quality skips.
    if (ctx.excludedOfferIds.has(args.offerId)) return "exclude";
    if (!primary || args.price <= 0 || !description) return "skip";
    const priceFils = args.compareAt ?? args.price;
    const saleFils = args.compareAt != null ? args.price : null;
    const mpn: string | null = product.mpn ?? null;
    return {
      offer_id: args.offerId,
      item_group_id: args.itemGroupId,
      title: product.name,
      description,
      link,
      image_link: primary.url,
      additional_image_links: images
        .filter((i: any) => i.url !== primary.url)
        .slice(0, 10)
        .map((i: any) => i.url),
      availability: availabilityFor(args.offerId, product, ctx),
      price_fils: priceFils,
      sale_price_fils: saleFils,
      currency,
      brand,
      gtin: args.gtin,
      mpn,
      condition: "new",
      google_product_category: category?.externalId ?? null,
      product_type: category?.path ?? null,
      country_of_origin: product.country_of_origin ?? null,
      identifier_exists: !!args.gtin || !!(brand && mpn),
    };
  };

  const collect = (outcome: FeedItem | "skip" | "exclude"): void => {
    if (outcome === "skip") result.skippedCount += 1;
    else if (outcome === "exclude") result.excludedCount += 1;
    else result.items.push(outcome);
  };

  if (product.has_variants) {
    for (const v of (product.variants ?? []).filter((x: any) => x.is_active)) {
      collect(
        buildItem({
          offerId: v.id,
          itemGroupId: product.id,
          price: v.price,
          compareAt: v.compare_at_price ?? null,
          gtin: v.barcode ?? null,
        }),
      );
    }
  } else {
    collect(
      buildItem({
        offerId: product.id,
        itemGroupId: null,
        price: product.price,
        compareAt: product.compare_at_price ?? null,
        gtin: product.barcode ?? null,
      }),
    );
  }

  return result;
}

export class FeedBuilderService {
  constructor(
    private productRepo: Repository<Product>,
    private webBaseUrl: string,
    private batchSize = 100,
  ) {}

  /** Loads the eligible catalog for a channel and builds its feed items. */
  async build(
    _channel: SalesChannel,
    categoryMap: Map<string, { externalId: string; path: string | null }>,
    excludedOfferIds: Set<string>,
  ): Promise<FeedBuildResult> {
    const out: FeedBuildResult = {
      items: [],
      itemCount: 0,
      excludedCount: 0,
      skippedCount: 0,
    };

    for (let skip = 0; ; skip += this.batchSize) {
      const products = await this.productRepo.find({
        where: { status: ProductStatus.published, published_at: Not(IsNull()) },
        relations: ["vendor", "brand", "images", "variants", "inventoryRecords"],
        order: { created_at: "ASC", id: "ASC" },
        skip,
        take: this.batchSize,
      });
      if (products.length === 0) break;

      const ctx: FeedBuildContext = {
        webBaseUrl: this.webBaseUrl,
        categoryMap,
        availability: buildAvailabilityMap(products),
        excludedOfferIds,
      };

      for (const product of products) {
        const r = productToFeedItems(product, ctx);
        out.items.push(...r.items);
        out.excludedCount += r.excludedCount;
        out.skippedCount += r.skippedCount;
      }

      if (products.length < this.batchSize) break;
    }

    out.itemCount = out.items.length;
    return out;
  }
}

/** Sums `quantity_available` per offer. Base products key on product id;
 *  variant rows key on variant id. */
function buildAvailabilityMap(products: any[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const product of products) {
    for (const inv of product.inventoryRecords ?? []) {
      const key: string = inv.variant_id ?? product.id;
      map.set(key, (map.get(key) ?? 0) + (inv.quantity_available ?? 0));
    }
  }
  return map;
}
