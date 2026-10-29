import type { ValidationContextBase } from "@materialhub/bulk-jobs";
import { FlashDeal, Product, ProductVariant } from "@materialhub/database";
import type { DataSource } from "typeorm";
import { IsNull } from "typeorm";
import type { ExistingDeal } from "../../domain/flash-deal/validation.ts";
import { type ResolvedKey, buildSkuResolverMaps } from "../shared/sku-resolver.ts";

export interface FlashDealImportCtx extends ValidationContextBase {
  vendorId: string;
  bySku: Map<string, ResolvedKey>;
  byExternalId: Map<string, ResolvedKey>;
  duplicateSkus: Set<string>;
  /** productId → unit price in fils */
  productPrices: Map<string, number>;
  /** variantId → unit price in fils (or product price if variant has no override) */
  variantPrices: Map<string, number>;
  /** Vendor-scoped active deals; preValidate appends synthetic in-batch entries. */
  existingActiveDeals: ExistingDeal[];
}

export async function buildFlashDealImportContext(args: {
  dataSource: DataSource;
  vendorId: string | null;
}): Promise<FlashDealImportCtx> {
  if (!args.vendorId) throw new Error("flash_deal_import requires a vendor");
  const vendorId = args.vendorId;

  const maps = await buildSkuResolverMaps(args.dataSource, vendorId);

  const products = await args.dataSource
    .getRepository(Product)
    .createQueryBuilder("p")
    .select(["p.id", "p.price"])
    .where("p.vendor_id = :v", { v: vendorId })
    .getMany();
  const productPrices = new Map<string, number>();
  for (const p of products) productPrices.set(p.id, p.price);

  const variants = await args.dataSource
    .getRepository(ProductVariant)
    .createQueryBuilder("v")
    .innerJoin("v.product", "p")
    .select(["v.id", "v.product_id", "v.price"])
    .where("p.vendor_id = :v", { v: vendorId })
    .getMany();
  const variantPrices = new Map<string, number>();
  for (const v of variants) {
    // Variants may not override price; fall back to the parent product's.
    const price = v.price ?? productPrices.get(v.product_id) ?? 0;
    variantPrices.set(v.id, price);
  }

  const dealRows = await args.dataSource.getRepository(FlashDeal).find({
    where: { vendor_id: vendorId, deleted_at: IsNull(), is_active: true },
    select: ["id", "product_id", "variant_id", "starts_at", "expires_at"],
  });
  const existingActiveDeals: ExistingDeal[] = dealRows.map((d) => ({
    id: d.id,
    product_id: d.product_id,
    variant_id: d.variant_id,
    starts_at: d.starts_at,
    expires_at: d.expires_at,
  }));

  return {
    vendorId,
    bySku: maps.bySku,
    byExternalId: maps.byExternalId,
    duplicateSkus: maps.duplicateSkus,
    productPrices,
    variantPrices,
    existingActiveDeals,
  };
}
