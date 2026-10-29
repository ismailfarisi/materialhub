import { config } from "@materialhub/config";
import { AppDataSource, ReelHotCategory } from "@materialhub/database";
import { type Job, Worker } from "bullmq";
import {
  INVALIDATE_JOB_NAME,
  INVALIDATE_QUEUE_NAME,
  type InvalidationPayload,
  computeAffectedCohortKeys,
  resolveAncestorCategoryIds,
} from "../category-cohort-invalidator.ts";
import type { FeedCacheClient } from "../feed-cache.client.ts";

export class InvalidateCategoryCohortJob {
  private worker: Worker | null = null;

  constructor(private readonly cache: FeedCacheClient) {}

  start(): void {
    this.worker = new Worker(
      INVALIDATE_QUEUE_NAME,
      async (job: Job<InvalidationPayload>) => {
        if (job.name !== INVALIDATE_JOB_NAME) return;
        const ancestorIds = await resolveAncestorCategoryIds(job.data.seedCategoryIds);
        if (ancestorIds.length === 0) return;
        const hotRows = await AppDataSource.getRepository(ReelHotCategory).find({
          where: ancestorIds.map((id) => ({ category_id: id })),
        });
        const keys = computeAffectedCohortKeys({
          ancestorCategoryIds: ancestorIds,
          hotRows: hotRows.map((r) => ({
            category_id: r.category_id,
            language_code: r.language_code,
            country_code: r.country_code,
          })),
        });
        await this.cache.invalidateMany(keys);
      },
      { connection: { url: config.bullmq.redisUrl } },
    );
  }

  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
  }
}
