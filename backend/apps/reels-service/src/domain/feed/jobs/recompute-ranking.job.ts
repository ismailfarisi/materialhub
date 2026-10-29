/**
 * Event-driven job: recompute a single reel's `ranking_score` when engagement
 * signals change (like/save/share/tap). Writes propagate into the cohort ZSET
 * on the next RecomputeCohortFeedsJob tick (~10 min).
 *
 * Debounced per-reel at 2 minutes: a burst of events for the same reel
 * coalesces to a single recompute, which is cheap (O(1) DB read + one UPDATE).
 */
import { config } from "@materialhub/config";
import { AppDataSource, Reel } from "@materialhub/database";
import { type Job, Queue, Worker } from "bullmq";
import { RankingService } from "../ranking.service.ts";

const QUEUE_NAME = "reels-ranking";
const JOB_NAME = "recomputeRanking";
const DEBOUNCE_MS = 2 * 60 * 1000; // 2 minutes

export class RecomputeRankingJob {
  private worker: Worker | null = null;
  private readonly queue: Queue;
  private readonly ranker = new RankingService();
  private readonly lastRunByReel = new Map<string, number>();

  constructor() {
    this.queue = new Queue(QUEUE_NAME, {
      connection: { url: config.bullmq.redisUrl },
    });
  }

  /** Enqueue with debounce. Multiple events for same reel within 2 min coalesce. */
  enqueue(reelId: string): void {
    const last = this.lastRunByReel.get(reelId);
    const now = Date.now();
    if (last && now - last < DEBOUNCE_MS) return;
    this.lastRunByReel.set(reelId, now);
    void this.queue.add(JOB_NAME, { reelId }, { removeOnComplete: 100 });
  }

  start(): void {
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job<{ reelId: string }>) => {
        const repo = AppDataSource.getRepository(Reel);
        const reel = await repo.findOne({ where: { id: job.data.reelId } });
        if (!reel || !reel.published_at) return;
        // Aggregate tap_count from reel_product_tags
        const tapAgg = await AppDataSource.query(
          "SELECT COALESCE(SUM(tap_count), 0)::int AS total FROM reel_product_tags WHERE reel_id = $1",
          [reel.id],
        );
        const score = this.ranker.computeScore({
          likeCount: reel.like_count,
          saveCount: reel.save_count,
          shareCount: reel.share_count,
          tapCount: tapAgg[0]?.total ?? 0,
          attributedPurchaseCount: 0, // M3 will populate this
          publishedAt: reel.published_at,
          now: new Date(),
        });
        reel.ranking_score = String(score);
        await repo.save(reel);
      },
      { connection: { url: config.bullmq.redisUrl } },
    );
  }

  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    await this.queue.close();
  }
}
