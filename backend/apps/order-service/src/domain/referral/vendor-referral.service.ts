import { AppDataSource, Referral, SiteSetting, Vendor } from "@materialhub/database";

/**
 * Phase 3b: vendors.user_id was dropped. Resolve a vendor for a given
 * (referred) user via the active owner row in vendor_members.
 */
async function findVendorByOwnerUserId(userId: string): Promise<Vendor | null> {
  const rows = (await AppDataSource.query(
    `SELECT v.* FROM vendors v
       JOIN vendor_members vm ON vm.vendor_id = v.id
      WHERE vm.user_id = $1
        AND vm.role = 'owner'
        AND vm.status = 'active'
        AND vm.deleted_at IS NULL
        AND v.deleted_at IS NULL
      LIMIT 1`,
    [userId],
  )) as Vendor[];
  return rows[0] ?? null;
}

export class VendorReferralService {
  private get vendorRepo() {
    return AppDataSource.getRepository(Vendor);
  }
  private get referralRepo() {
    return AppDataSource.getRepository(Referral);
  }
  private get settingsRepo() {
    return AppDataSource.getRepository(SiteSetting);
  }

  async applyReferredVendorDiscount(vendorUserId: string): Promise<void> {
    const referral = await this.referralRepo.findOne({
      where: { referred_id: vendorUserId },
    });
    if (!referral) return;

    const vendor = await findVendorByOwnerUserId(vendorUserId);
    if (!vendor) return;

    const discountSetting = await this.settingsRepo.findOne({
      where: { key: "referral_vendor_commission_rate" },
    });
    const discountRate = discountSetting ? Number.parseFloat(discountSetting.value) : 5.0;

    vendor.commission_value = discountRate;
    await this.vendorRepo.save(vendor);
  }

  async restoreExpiredCommissionOverrides(): Promise<number> {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // Phase 3b: join via vendor_members (owner/active) instead of vendor.user_id.
    const expiredReferrals = await this.referralRepo
      .createQueryBuilder("r")
      .innerJoin(
        "vendor_members",
        "vm",
        "vm.user_id = r.referred_id AND vm.role = 'owner' AND vm.status = 'active' AND vm.deleted_at IS NULL",
      )
      .innerJoin("vendors", "v", "v.id = vm.vendor_id AND v.deleted_at IS NULL")
      .where("r.referred_id IS NOT NULL")
      .andWhere("r.status IN (:...statuses)", { statuses: ["signed_up", "completed", "rewarded"] })
      .andWhere("r.created_at < :cutoff", { cutoff })
      .getMany();

    let restored = 0;
    for (const referral of expiredReferrals) {
      if (!referral.referred_id) continue;
      const vendor = await findVendorByOwnerUserId(referral.referred_id);
      if (!vendor) continue;

      const defaultSetting = await this.settingsRepo.findOne({
        where: { key: "default_commission_rate" },
      });
      const defaultRate = defaultSetting ? Number.parseFloat(defaultSetting.value) : 10.0;

      const discountSetting = await this.settingsRepo.findOne({
        where: { key: "referral_vendor_commission_rate" },
      });
      const discountRate = discountSetting ? Number.parseFloat(discountSetting.value) : 5.0;

      if (vendor.commission_value !== null && vendor.commission_value <= discountRate) {
        vendor.commission_value = defaultRate;
        await this.vendorRepo.save(vendor);
        restored++;
      }
    }

    return restored;
  }
}
