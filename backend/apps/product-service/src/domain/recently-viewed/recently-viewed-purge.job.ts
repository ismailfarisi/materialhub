import { config } from "@materialhub/config";
import { Queue, Worker } from "bullmq";
import type { RecentlyViewedService } from "./recently-viewed.service.ts";

const QUEUE_NAME = "recently-viewed-purge";

let recentlyViewedPurgeQueue: Queue | null = null;

export function getRecentlyViewedPurgeQueue(): Queue {
  if (!recentlyViewedPurgeQueue) {
    recentlyViewedPurgeQueue = new Queue(QUEUE_NAME, {
      connection: { url: config.bullmq.redisUrl },
    });
  }
  return recentlyViewedPurgeQueue;
}

export function createRecentlyViewedPurgeWorker(service: RecentlyViewedService) {
  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      const purged = await service.purgeOld(90);
      console.log(`[recently-viewed-purge] Purged ${purged} entries older than 90 days`);
    },
    { connection: { url: config.bullmq.redisUrl } },
  );
  return worker;
}

export async function scheduleRecentlyViewedPurge(queue: Queue) {
  await queue.upsertJobScheduler(
    "daily-purge",
    { pattern: "0 3 * * *" },
    { name: "purge-old-views" },
  );
}
