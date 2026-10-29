import { config } from "@materialhub/config";
import { type Job, Queue, Worker } from "bullmq";
import type { SearchReindexService } from "./search-reindex.service.ts";

export const SEARCH_REINDEX_QUEUE = "search-reindex";
export const SEARCH_REINDEX_JOB = "reindex";

export interface SearchReindexJobResult {
  processed: number;
  durationMs: number;
}

let searchReindexQueue: Queue | null = null;

export function getSearchReindexQueue(): Queue {
  if (!searchReindexQueue) {
    searchReindexQueue = new Queue(SEARCH_REINDEX_QUEUE, {
      connection: { url: config.bullmq.redisUrl },
      defaultJobOptions: {
        // Reindex is an expensive, user-triggered action — don't auto-retry
        // on failure. The admin can look at the failed job, see the error,
        // and try again manually.
        attempts: 1,
        removeOnComplete: 20,
        removeOnFail: 20,
      },
    });
  }
  return searchReindexQueue;
}

export async function enqueueSearchReindex(actorId: string | null = null): Promise<string> {
  const queue = getSearchReindexQueue();
  const job = await queue.add(SEARCH_REINDEX_JOB, { actorId, startedAt: Date.now() });
  if (!job.id) {
    // BullMQ assigns an id synchronously in practice; defensive throw
    // keeps the callsite's non-null contract honest.
    throw new Error("BullMQ returned a job without an id");
  }
  return job.id;
}

export function createSearchReindexWorker(reindexService: SearchReindexService): Worker {
  return new Worker(
    SEARCH_REINDEX_QUEUE,
    async (job: Job): Promise<SearchReindexJobResult> => {
      const startedAt = Date.now();
      const processed = await reindexService.reindexAll(async (p) => {
        const percent = p.total > 0 ? Math.round((p.processed / p.total) * 100) : 0;
        await job.updateProgress({
          processed: p.processed,
          total: p.total,
          percent,
        });
      });
      return { processed, durationMs: Date.now() - startedAt };
    },
    {
      connection: { url: config.bullmq.redisUrl },
      // Single concurrency — reindex drops & recreates the collection, so
      // overlapping runs would corrupt state.
      concurrency: 1,
    },
  );
}
