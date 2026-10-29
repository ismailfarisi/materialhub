import type { CollectionCreateSchema } from "typesense/lib/Typesense/Collections.js";

export const productCollectionSchema: CollectionCreateSchema = {
  name: "products",
  default_sorting_field: "price_min",
  fields: [
    { name: "name", type: "string" },
    { name: "description", type: "string", optional: true },
    { name: "category_name", type: "string", facet: true },
    { name: "category_ids", type: "string[]", optional: true },
    { name: "category_slugs", type: "string[]", facet: true, optional: true },
    { name: "brand_name", type: "string", facet: true, optional: true },
    { name: "brand_id", type: "string", optional: true },
    { name: "brand_slug", type: "string", facet: true, optional: true },
    { name: "vendor_name", type: "string", facet: true },
    { name: "vendor_id", type: "string" },
    { name: "vendor_slug", type: "string", facet: true, optional: true },
    { name: "price_min", type: "int32" },
    { name: "price_max", type: "int32" },
    { name: "compare_at_price", type: "int32", optional: true },
    { name: "tags", type: "string[]", facet: true, optional: true },
    { name: "rating_avg", type: "float", facet: true, optional: true },
    { name: "in_stock", type: "bool", facet: true },
    { name: "attributes", type: "string[]", facet: true, optional: true },
    { name: "slug", type: "string" },
    { name: "skus", type: "string[]", optional: true },
    { name: "images", type: "string[]", optional: true },
    { name: "status", type: "string" },
    { name: "created_at", type: "int64" },
    { name: "group_id", type: "string", optional: true },
    { name: "group_listing_mode", type: "string", facet: true, optional: true },
    { name: "is_group_primary", type: "bool", optional: true },
    { name: "group_swatches", type: "string[]", optional: true },
    { name: "group_from_price", type: "int32", optional: true },
  ],
  token_separators: ["-", "/"],
  enable_nested_fields: false,
};

export interface CategoryAncestors {
  ids: string[];
  slugs: string[];
}

export interface ProductDocument {
  id: string;
  name: string;
  description?: string;
  category_name: string;
  category_ids?: string[];
  category_slugs?: string[];
  brand_name?: string;
  brand_id?: string;
  brand_slug?: string;
  vendor_name: string;
  vendor_id: string;
  vendor_slug?: string;
  price_min: number;
  price_max: number;
  compare_at_price?: number;
  tags?: string[];
  rating_avg?: number;
  in_stock: boolean;
  attributes?: string[];
  slug: string;
  skus?: string[];
  images?: string[];
  status: string;
  created_at: number;
  group_id?: string;
  group_listing_mode?: string;
  is_group_primary?: boolean;
  group_swatches?: string[];
  group_from_price?: number;
}

export interface GroupInfoForIndex {
  group_id: string;
  listing_mode: "collapsed" | "individual";
  is_primary: boolean;
  swatches: string[];
  from_price: number;
}

export function productToDocument(
  product: any,
  ancestors?: CategoryAncestors,
  groupInfo?: GroupInfoForIndex | null,
): ProductDocument {
  const variants = product.variants?.filter((v: any) => v.is_active) ?? [];
  const prices = variants.length > 0 ? variants.map((v: any) => v.price) : [product.price];
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  // Determine stock from inventory data (joined or pre-computed)
  let inStock = false;
  if (product.inventoryRecords?.length) {
    inStock = product.inventoryRecords.some(
      (inv: any) => inv.quantity_on_hand - inv.quantity_reserved > 0,
    );
  } else if (product.in_stock != null) {
    inStock = product.in_stock;
  }

  // Flatten attributes as "<attribute_id>:<attribute_value_id>" so the facet
  // hydrator in typesense-search.adapter.ts can look up each attribute +
  // value row directly without relying on display-name collisions. Skip rows
  // that don't have both ids (e.g. custom_value-only, free-text attributes).
  const attributes: string[] = [];
  if (product.attributeValues) {
    for (const av of product.attributeValues) {
      if (av.attribute_id && av.attribute_value_id) {
        attributes.push(`${av.attribute_id}:${av.attribute_value_id}`);
      }
    }
  }

  // Collect image URLs sorted by sort_order, primary first
  const images: string[] = [];
  if (product.images?.length) {
    const sorted = [...product.images].sort((a: any, b: any) => {
      if (a.is_primary && !b.is_primary) return -1;
      if (!a.is_primary && b.is_primary) return 1;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
    for (const img of sorted) {
      // Web product cards consume Typesense results. Use the 600px medium
      // variant first so listing cards stay sharp on desktop and retina
      // screens, while still avoiding the full 1200px large image by default.
      images.push(img.medium_url || img.card_url || img.thumbnail_url || img.url);
    }
  }

  // Multi-valued category fields hold the leaf + all ancestors so a Typesense
  // filter on a parent slug matches every product in its subtree. When
  // ancestors aren't provided (e.g. a single-product upsert path that didn't
  // pre-fetch the chain) fall back to leaf-only.
  const leafCatId: string | undefined = product.category_id || undefined;
  const leafCatSlug: string | undefined = product.category?.slug || undefined;
  const category_ids = ancestors?.ids ?? (leafCatId ? [leafCatId] : undefined);
  const category_slugs = ancestors?.slugs ?? (leafCatSlug ? [leafCatSlug] : undefined);

  // SKUs for collection rule filtering: product-level sku + active variant skus.
  const skuSet = new Set<string>();
  if (product.sku) skuSet.add(product.sku);
  for (const v of variants) {
    if (v.sku) skuSet.add(v.sku);
  }
  const skus = skuSet.size > 0 ? [...skuSet] : undefined;

  const doc: ProductDocument = {
    id: product.id,
    name: product.name,
    description: product.short_description || undefined,
    category_name: product.category?.name || "Uncategorized",
    category_ids,
    category_slugs,
    brand_name: product.brand?.name || undefined,
    brand_id: product.brand_id || undefined,
    brand_slug: product.brand?.slug || undefined,
    vendor_name: product.vendor?.name || "Unknown",
    vendor_id: product.vendor_id,
    vendor_slug: product.vendor?.slug || undefined,
    price_min: minPrice,
    price_max: maxPrice,
    compare_at_price: product.compare_at_price || undefined,
    tags: product.tags || undefined,
    rating_avg: product.rating_avg ? Number(product.rating_avg) : undefined,
    in_stock: inStock,
    attributes: attributes.length > 0 ? attributes : undefined,
    slug: product.slug,
    skus,
    images: images.length > 0 ? images : undefined,
    status: product.status,
    created_at: Math.floor(new Date(product.created_at).getTime() / 1000),
  };

  if (groupInfo) {
    doc.group_id = groupInfo.group_id;
    doc.group_listing_mode = groupInfo.listing_mode;
    doc.is_group_primary = groupInfo.is_primary;
    if (groupInfo.is_primary) {
      doc.group_swatches = groupInfo.swatches;
      doc.group_from_price = groupInfo.from_price;
    }
  } else {
    // Sentinel so the listing collapse filter (group_listing_mode:!=collapsed ...)
    // is unambiguous for non-grouped products regardless of Typesense's
    // absent-field semantics.
    doc.group_listing_mode = "none";
  }

  return doc;
}
