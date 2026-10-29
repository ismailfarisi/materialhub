import type { ValidationContextBase } from "@materialhub/bulk-jobs";
import { FlashDeal } from "@materialhub/database";
import type { DataSource } from "typeorm";
import { IsNull, MoreThan } from "typeorm";
import { type ResolvedKey, buildSkuResolverMaps } from "../shared/sku-resolver.ts";

export interface CandidateDeal {
  id: string;
  product_id: string;
  variant_id: string | null;
  expires_at: Date;
  // Snapshot for diff log on delete
  title: string;
  deal_price: number;
  original_price: number;
  starts_at: Date;
  quantity_limit: number | null;
}

export interface FlashDealDeleteCtx extends ValidationContextBase {
  vendorId: string;
  bySku: Map<string, ResolvedKey>;
  byExternalId: Map<string, ResolvedKey>;
  duplicateSkus: Set<string>;
  /** Key: `${productId}|${variantId ?? ''}` */
  dealsByProductVariant: Map<string, CandidateDeal[]>;
}

export async function buildFlashDealDeleteContext(args: {
  dataSource: DataSource;
  vendorId: string | null;
}): Promise<FlashDealDeleteCtx> {
  if (!args.vendorId) throw new Error("flash_deal_delete requires a vendor");
  const vendorId = args.vendorId;

  const maps = await buildSkuResolverMaps(args.dataSource, vendorId);

  const now = new Date();
  const dealRows = await args.dataSource.getRepository(FlashDeal).find({
    where: {
      vendor_id: vendorId,
      deleted_at: IsNull(),
      expires_at: MoreThan(now),
    },
  });

  const dealsByProductVariant = new Map<string, CandidateDeal[]>();
  for (const d of dealRows) {
    const key = `${d.product_id}|${d.variant_id ?? ""}`;
    const arr = dealsByProductVariant.get(key) ?? [];
    arr.push({
      id: d.id,
      product_id: d.product_id,
      variant_id: d.variant_id,
      expires_at: d.expires_at,
      title: d.title,
      deal_price: d.deal_price,
      original_price: d.original_price,
      starts_at: d.starts_at,
      quantity_limit: d.quantity_limit,
    });
    dealsByProductVariant.set(key, arr);
  }

  return {
    vendorId,
    bySku: maps.bySku,
    byExternalId: maps.byExternalId,
    duplicateSkus: maps.duplicateSkus,
    dealsByProductVariant,
  };
}
