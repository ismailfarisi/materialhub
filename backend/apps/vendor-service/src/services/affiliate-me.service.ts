import { AffiliateCommission, AppDataSource, VendorAffiliate } from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";
import { IsNull } from "typeorm";
import type { Repository } from "typeorm";

export class AffiliateMeService {
  constructor(
    private readonly affiliateRepo: Repository<VendorAffiliate> = AppDataSource.getRepository(
      VendorAffiliate,
    ),
    private readonly commissionRepo: Repository<AffiliateCommission> = AppDataSource.getRepository(
      AffiliateCommission,
    ),
  ) {}

  async listAffiliations(userId: string): Promise<VendorAffiliate[]> {
    return this.affiliateRepo.find({
      where: { user_id: userId, deleted_at: IsNull() },
      order: { created_at: "DESC" },
    });
  }

  async assertOwnsAffiliate(userId: string, affiliateId: string): Promise<VendorAffiliate> {
    const aff = await this.affiliateRepo.findOne({
      where: { id: affiliateId, deleted_at: IsNull() },
    });
    if (!aff || aff.user_id !== userId)
      throw new HttpError(404, "Affiliate not found", "AFFILIATE_NOT_FOUND");
    return aff;
  }

  async earningsSummary(
    userId: string,
  ): Promise<Array<{ status: string; total_fils: string; count: number }>> {
    return this.commissionRepo
      .createQueryBuilder("ac")
      .select("ac.status", "status")
      .addSelect("SUM(ac.commission_fils)::bigint", "total_fils")
      .addSelect("COUNT(*)::int", "count")
      .innerJoin("vendor_affiliates", "va", "va.id = ac.vendor_affiliate_id")
      .where("va.user_id = :userId", { userId })
      .groupBy("ac.status")
      .getRawMany();
  }
}
