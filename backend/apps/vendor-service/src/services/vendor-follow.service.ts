import { AppDataSource, Vendor, VendorFollower } from "@materialhub/database";

export class VendorFollowService {
  private get repo() {
    return AppDataSource.getRepository(VendorFollower);
  }
  private get vendorRepo() {
    return AppDataSource.getRepository(Vendor);
  }

  /** Idempotent follow — second call for the same (vendor,user) is a no-op. */
  async follow(vendorId: string, userId: string): Promise<{ followed: true }> {
    const existing = await this.repo.findOne({
      where: { vendor_id: vendorId, user_id: userId },
    });
    if (existing) return { followed: true };
    await this.repo.insert({ vendor_id: vendorId, user_id: userId });
    await this.vendorRepo.increment({ id: vendorId }, "follower_count", 1);
    return { followed: true };
  }

  /** Idempotent unfollow. */
  async unfollow(vendorId: string, userId: string): Promise<{ followed: false }> {
    const existing = await this.repo.findOne({
      where: { vendor_id: vendorId, user_id: userId },
    });
    if (!existing) return { followed: false };
    await this.repo.delete({ vendor_id: vendorId, user_id: userId });
    await this.vendorRepo.decrement({ id: vendorId }, "follower_count", 1);
    return { followed: false };
  }

  async isFollowing(vendorId: string, userId: string): Promise<boolean> {
    const existing = await this.repo.findOne({
      where: { vendor_id: vendorId, user_id: userId },
    });
    return !!existing;
  }

  async recentFollowed(userId: string, limit = 4) {
    const rows = await this.repo.find({
      where: { user_id: userId },
      relations: ["vendor"],
      order: { followed_at: "DESC" },
      take: limit,
    });
    return rows
      .map((r) => r.vendor)
      .filter(Boolean)
      .map((v) => ({
        id: v.id,
        name: v.name,
        slug: v.slug,
        logo_url: v.logo_url,
        rating_avg:
          typeof v.rating_avg === "string" ? Number.parseFloat(v.rating_avg) : v.rating_avg,
        follower_count: v.follower_count,
        // Resolve a city/country label from the address JSONB if present.
        location:
          typeof v.address === "object" && v.address && "city" in (v.address as any)
            ? ((v.address as any).city as string)
            : null,
        product_count: null as number | null,
      }));
  }
}
