import { AppDataSource, ReelLike } from "@materialhub/database";
import type { Repository } from "typeorm";
import type { RecomputeRankingJob } from "../feed/jobs/recompute-ranking.job.ts";

export class LikeService {
  private repo!: Repository<ReelLike>;
  constructor(private readonly rankingJob?: RecomputeRankingJob) {}

  private getRepo(): Repository<ReelLike> {
    if (!this.repo) this.repo = AppDataSource.getRepository(ReelLike);
    return this.repo;
  }

  async toggle(reelId: string, userId: string): Promise<{ action: "liked" | "unliked" }> {
    const repo = this.getRepo();
    const existing = await repo.findOne({
      where: { reel_id: reelId, user_id: userId },
    });
    if (existing) {
      await repo.delete({ reel_id: reelId, user_id: userId });
      this.rankingJob?.enqueue(reelId);
      return { action: "unliked" };
    }
    await repo.save(repo.create({ reel_id: reelId, user_id: userId }));
    this.rankingJob?.enqueue(reelId);
    return { action: "liked" };
  }
}
