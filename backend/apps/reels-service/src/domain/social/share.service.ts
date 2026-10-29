import { AppDataSource, Reel } from "@materialhub/database";
import type { RecomputeRankingJob } from "../feed/jobs/recompute-ranking.job.ts";

export class ShareService {
  constructor(private readonly rankingJob?: RecomputeRankingJob) {}

  async recordShare(reelId: string): Promise<{ shareCount: number; shareableUrl: string }> {
    await AppDataSource.getRepository(Reel).increment({ id: reelId }, "share_count", 1);
    const reel = await AppDataSource.getRepository(Reel).findOne({
      where: { id: reelId },
      select: ["share_count"],
    });
    this.rankingJob?.enqueue(reelId);
    return {
      shareCount: reel?.share_count ?? 0,
      shareableUrl: `${process.env.WEB_BASE_URL ?? "https://www.materialhubuae.com"}/reels/${reelId}`,
    };
  }
}
