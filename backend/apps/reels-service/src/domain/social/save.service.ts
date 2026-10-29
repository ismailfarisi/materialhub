import { AppDataSource, ReelSave } from "@materialhub/database";
import type { Repository } from "typeorm";
import type { RecomputeRankingJob } from "../feed/jobs/recompute-ranking.job.ts";

export class SaveService {
  private repo!: Repository<ReelSave>;
  constructor(private readonly rankingJob?: RecomputeRankingJob) {}

  private getRepo(): Repository<ReelSave> {
    if (!this.repo) this.repo = AppDataSource.getRepository(ReelSave);
    return this.repo;
  }

  async toggle(reelId: string, userId: string): Promise<{ action: "saved" | "unsaved" }> {
    const repo = this.getRepo();
    const existing = await repo.findOne({
      where: { reel_id: reelId, user_id: userId },
    });
    if (existing) {
      await repo.delete({ reel_id: reelId, user_id: userId });
      this.rankingJob?.enqueue(reelId);
      return { action: "unsaved" };
    }
    await repo.save(repo.create({ reel_id: reelId, user_id: userId }));
    this.rankingJob?.enqueue(reelId);
    return { action: "saved" };
  }

  async listForUser(userId: string, cursor?: string, limit = 20) {
    const qb = this.getRepo()
      .createQueryBuilder("s")
      .innerJoinAndSelect("s.reel", "r")
      .where("s.user_id = :uid", { uid: userId })
      .orderBy("s.saved_at", "DESC")
      .limit(limit + 1);
    if (cursor) qb.andWhere("s.saved_at < :c", { c: new Date(cursor) });
    const rows = await qb.getMany();
    const items = rows.slice(0, limit);
    const nextCursor = rows.length > limit ? items[items.length - 1]!.saved_at.toISOString() : null;
    return { items, nextCursor };
  }
}
