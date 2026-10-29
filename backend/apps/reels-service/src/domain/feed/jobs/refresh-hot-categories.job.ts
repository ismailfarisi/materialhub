import { config } from "@materialhub/config";
import { AppDataSource } from "@materialhub/database";
import { type Job, Queue, Worker } from "bullmq";

const QUEUE_NAME = "reels-scheduled";
const JOB_NAME = "refreshHotCategories";
const REPEAT_EVERY_MS = 60 * 60 * 1000; // 1 hour
const MIN_REEL_COUNT = 20;
const WINDOW_DAYS = 30;
const STALENESS_HOURS = 2;

export function buildHotCategorySelectionSql(opts: {
  minReelCount: number;
  windowDays: number;
}): string {
  return `
    INSERT INTO reel_hot_categories (category_id, language_code, country_code, reel_count_30d, last_recomputed_at)
    SELECT c.id, COALESCE(r.language_code, 'en') AS language_code, 'AE' AS country_code,
           COUNT(DISTINCT r.id) AS reel_count,
           NOW()
    FROM categories c
    LEFT JOIN products p          ON p.category_id = c.id AND p.deleted_at IS NULL
    LEFT JOIN reel_product_tags t ON t.product_id = p.id
    LEFT JOIN reels r             ON r.id = t.reel_id
                                   AND r.status = 'approved'
                                   AND r.deleted_at IS NULL
                                   AND r.published_at > NOW() - INTERVAL '${opts.windowDays} days'
    WHERE c.deleted_at IS NULL
    GROUP BY c.id, c.depth, COALESCE(r.language_code, 'en')
    HAVING c.depth = 0 OR COUNT(DISTINCT r.id) >= ${opts.minReelCount}
    ON CONFLICT (category_id, language_code, country_code) DO UPDATE
      SET reel_count_30d = EXCLUDED.reel_count_30d,
          last_recomputed_at = NOW();
  `;
}

export class RefreshHotCategoriesJob {
  private worker: Worker | null = null;
  private readonly queue: Queue;

  constructor() {
    this.queue = new Queue(QUEUE_NAME, { connection: { url: config.bullmq.redisUrl } });
  }

  start(): void {
    void this.queue.add(
      JOB_NAME,
      {},
      { repeat: { every: REPEAT_EVERY_MS }, removeOnComplete: 5, removeOnFail: 50 },
    );
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        if (job.name !== JOB_NAME) return;
        await this.runOnce();
      },
      { connection: { url: config.bullmq.redisUrl } },
    );
  }

  async runOnce(): Promise<void> {
    const sql = buildHotCategorySelectionSql({
      minReelCount: MIN_REEL_COUNT,
      windowDays: WINDOW_DAYS,
    });
    await AppDataSource.query(sql);
    await AppDataSource.query(
      `DELETE FROM reel_hot_categories WHERE last_recomputed_at < NOW() - INTERVAL '${STALENESS_HOURS} hours'`,
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
