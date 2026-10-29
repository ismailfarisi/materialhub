import { config } from "@materialhub/config";
import { Queue, Worker } from "bullmq";
import type { CartAbandonmentService } from "./cart-abandonment.service.ts";

const QUEUE_NAME = "cart-abandonment-purge";

let purgeQueue: Queue | null = null;

export function getCartAbandonmentPurgeQueue(): Queue {
  if (!purgeQueue) {
    purgeQueue = new Queue(QUEUE_NAME, { connection: { url: config.bullmq.redisUrl } });
  }
  return purgeQueue;
}

export function createCartAbandonmentPurgeWorker(service: CartAbandonmentService) {
  return new Worker(
    QUEUE_NAME,
    async () => {
      const purged = await service.purgeOld(30);
      console.log(`[cart-abandonment-purge] Purged ${purged} records older than 30 days`);
    },
    { connection: { url: config.bullmq.redisUrl } },
  );
}

export async function scheduleCartAbandonmentPurge(queue: Queue) {
  await queue.upsertJobScheduler(
    "daily-abandonment-purge",
    { pattern: "0 4 * * *" },
    { name: "purge-old-abandoned" },
  );
}
