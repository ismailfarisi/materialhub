import { AppDataSource, RecentlyViewed } from "@materialhub/database";
import { LessThan } from "typeorm";

const MAX_PER_USER = 50;

export class RecentlyViewedService {
  private get repo() {
    return AppDataSource.getRepository(RecentlyViewed);
  }

  async record(productId: string, userId: string | null, guestSessionId: string | null) {
    const where: any = { product_id: productId };
    if (userId) where.user_id = userId;
    else where.guest_session_id = guestSessionId;

    const existing = await this.repo.findOne({ where });
    if (existing) {
      existing.viewed_at = new Date();
      return this.repo.save(existing);
    }

    const entry = this.repo.create({
      product_id: productId,
      user_id: userId,
      guest_session_id: guestSessionId,
      viewed_at: new Date(),
    });
    await this.repo.save(entry);
    await this.capEntries(userId, guestSessionId);
    return entry;
  }

  async list(userId: string | null, guestSessionId: string | null, limit = 20) {
    const where: any = {};
    if (userId) where.user_id = userId;
    else where.guest_session_id = guestSessionId;

    return this.repo.find({
      where,
      relations: ["product", "product.images"],
      order: { viewed_at: "DESC" },
      take: limit,
    });
  }

  async purgeOld(daysOld = 90) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);
    const result = await this.repo.delete({ viewed_at: LessThan(cutoff) } as any);
    return result.affected ?? 0;
  }

  private async capEntries(userId: string | null, guestSessionId: string | null) {
    const where: any = {};
    if (userId) where.user_id = userId;
    else where.guest_session_id = guestSessionId;

    const count = await this.repo.count({ where });
    if (count <= MAX_PER_USER) return;

    const oldest = await this.repo.find({
      where,
      order: { viewed_at: "ASC" },
      take: count - MAX_PER_USER,
    });

    if (oldest.length > 0) {
      await this.repo.remove(oldest);
    }
  }
}
