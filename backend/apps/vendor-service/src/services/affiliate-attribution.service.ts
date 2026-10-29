import {
  AffiliateAttribution,
  AppDataSource,
  SiteSetting,
  VendorAffiliate,
  VendorAffiliateStatus,
} from "@materialhub/database";
import { IsNull } from "typeorm";
import type { Repository } from "typeorm";

export interface RecordClickInput {
  code: string;
  buyerUserId: string | null;
  sessionId: string | null;
  productId?: string | null;
  affiliateLinkId?: string | null;
}

const DEFAULT_WINDOW_DAYS = 7;
const WINDOW_SETTING_KEY = "affiliate_attribution_window_days";

export class AffiliateAttributionService {
  private settings: { get(key: string): Promise<string> } = {
    async get(key: string) {
      const row = await AppDataSource.getRepository(SiteSetting).findOne({ where: { key } });
      return row?.value ?? "";
    },
  };

  constructor(
    private readonly affiliateRepo: Repository<VendorAffiliate> = AppDataSource.getRepository(
      VendorAffiliate,
    ),
    private readonly attrRepo: Repository<AffiliateAttribution> = AppDataSource.getRepository(
      AffiliateAttribution,
    ),
  ) {}

  async recordClick(input: RecordClickInput): Promise<AffiliateAttribution | null> {
    // Defence-in-depth — the route also checks. No identity => nothing to attribute.
    if (!input.buyerUserId && !input.sessionId) return null;

    const affiliate = await this.affiliateRepo.findOne({
      where: { affiliate_code: input.code, deleted_at: IsNull() },
    });
    if (!affiliate || affiliate.status !== VendorAffiliateStatus.active) return null;

    const raw = await this.settings.get(WINDOW_SETTING_KEY);
    const parsed = Number.parseInt(raw, 10);
    const windowDays = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_WINDOW_DAYS;

    const clickedAt = new Date();
    const expiresAt = new Date(clickedAt.getTime() + windowDays * 86_400_000);

    const row = this.attrRepo.create({
      vendor_affiliate_id: affiliate.id,
      vendor_id: affiliate.vendor_id,
      user_id: input.buyerUserId,
      session_id: input.sessionId,
      product_id: input.productId ?? null,
      affiliate_link_id: input.affiliateLinkId ?? null,
      clicked_at: clickedAt,
      expires_at: expiresAt,
      attribution_window_days_snapshot: windowDays,
    });
    return this.attrRepo.save(row);
  }
}
