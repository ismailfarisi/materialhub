import { Product, ProductVariant } from "@materialhub/database";
import type { DataSource } from "typeorm";

export interface ResolvedKey {
  productId: string;
  variantId: string | null;
  hasVariants: boolean;
  deleted: boolean;
}

export interface SkuResolverMaps {
  bySku: Map<string, ResolvedKey>;
  byExternalId: Map<string, ResolvedKey>;
  duplicateSkus: Set<string>;
}

/**
 * Build a vendor-scoped index of products + variants keyed by sku and external_id.
 * Variants index first; products fall back. Duplicate skus across catalog → tracked
 * in `duplicateSkus` so the caller can emit AMBIGUOUS_PRODUCT for them.
 *
 * Used by inventory-update, flash-deal-import, and flash-deal-delete.
 */
export async function buildSkuResolverMaps(
  dataSource: DataSource,
  vendorId: string,
): Promise<SkuResolverMaps> {
  const products = await dataSource
    .getRepository(Product)
    .createQueryBuilder("p")
    .where("p.vendor_id = :v", { v: vendorId })
    .getMany();
  const variants = await dataSource
    .getRepository(ProductVariant)
    .createQueryBuilder("v")
    .innerJoin("v.product", "p")
    .where("p.vendor_id = :v", { v: vendorId })
    .getMany();

  const bySku = new Map<string, ResolvedKey>();
  const byExternalId = new Map<string, ResolvedKey>();
  const seenSkus = new Set<string>();
  const duplicateSkus = new Set<string>();

  for (const p of products) {
    const entry: ResolvedKey = {
      productId: p.id,
      variantId: null,
      hasVariants: !!p.has_variants,
      deleted: p.deleted_at != null,
    };
    if (p.sku) {
      if (seenSkus.has(p.sku)) duplicateSkus.add(p.sku);
      else seenSkus.add(p.sku);
      bySku.set(p.sku, entry);
    }
    if (p.external_id) byExternalId.set(p.external_id, entry);
  }
  for (const v of variants) {
    const entry: ResolvedKey = {
      productId: v.product_id,
      variantId: v.id,
      hasVariants: false,
      deleted: v.deleted_at != null,
    };
    if (v.sku) {
      if (seenSkus.has(v.sku)) duplicateSkus.add(v.sku);
      else seenSkus.add(v.sku);
      bySku.set(v.sku, entry);
    }
    if (v.external_id) byExternalId.set(v.external_id, entry);
  }

  return { bySku, byExternalId, duplicateSkus };
}
