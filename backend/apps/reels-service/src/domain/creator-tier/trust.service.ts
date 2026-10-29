import { AppDataSource, CreatorTier, User } from "@materialhub/database";
import type { Repository } from "typeorm";

export class TrustService {
  private repo!: Repository<User>;

  private getRepo(): Repository<User> {
    if (!this.repo) this.repo = AppDataSource.getRepository(User);
    return this.repo;
  }

  /**
   * A user is "trusted" (i.e. their reels bypass moderation queue) when either:
   *  - they are a graduated creator (tier = creator or influencer), OR
   *  - they have the can_tag_unowned seed-cohort bypass.
   *
   * M1 shipped only the can_tag_unowned path; M4 adds the creator tier path
   * after auto-graduation via site_settings thresholds.
   */
  async isTrusted(userId: string): Promise<boolean> {
    const user = await this.getRepo().findOne({ where: { id: userId } });
    if (!user) return false;
    if (user.creator_tier === CreatorTier.creator || user.creator_tier === CreatorTier.influencer) {
      return true;
    }
    if (user.can_tag_unowned) return true;
    return false;
  }
}
