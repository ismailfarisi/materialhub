import {
  AffiliateLink,
  AppDataSource,
  VendorAffiliate,
  VendorAffiliateStatus,
} from "@materialhub/database";
import { IsNull } from "typeorm";
import type { Repository } from "typeorm";

export interface ResolveResult {
  code: string;
  targetType: "store" | "product" | "brand" | "custom_url";
  targetId: string | null;
  targetUrl: string | null;
  vendorId: string;
}

export class AffiliateResolveService {
  constructor(
    private readonly linkRepo: Repository<AffiliateLink> = AppDataSource.getRepository(
      AffiliateLink,
    ),
    private readonly affiliateRepo: Repository<VendorAffiliate> = AppDataSource.getRepository(
      VendorAffiliate,
    ),
  ) {}

  async resolveAndClick(slug: string): Promise<ResolveResult | null> {
    const link = await this.linkRepo.findOne({ where: { slug, deleted_at: IsNull() } });
    if (!link) return null;

    const affiliate = await this.affiliateRepo.findOne({
      where: { id: link.vendor_affiliate_id, deleted_at: IsNull() },
    });
    if (!affiliate || affiliate.status !== VendorAffiliateStatus.active) return null;

    // Denormalized click counter — best-effort, never blocks the redirect.
    await this.linkRepo.increment({ id: link.id }, "click_count", 1);

    return {
      code: affiliate.affiliate_code,
      targetType: link.target_type as "store" | "product" | "brand" | "custom_url",
      targetId: link.target_id,
      targetUrl: link.target_url ?? null,
      vendorId: affiliate.vendor_id,
    };
  }
}
