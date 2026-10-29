import { config } from "@materialhub/config";
import { Queue, Worker } from "bullmq";
import type { CartAbandonmentService } from "./cart-abandonment.service.ts";

const QUEUE_NAME = "cart-abandonment-detection";

let detectionQueue: Queue | null = null;

export function getCartAbandonmentDetectionQueue(): Queue {
  if (!detectionQueue) {
    detectionQueue = new Queue(QUEUE_NAME, { connection: { url: config.bullmq.redisUrl } });
  }
  return detectionQueue;
}

export function createCartAbandonmentDetectionWorker(service: CartAbandonmentService) {
  return new Worker(
    QUEUE_NAME,
    async () => {
      const count = await service.detectAbandoned();
      console.log(`[cart-abandonment-detection] Found ${count} newly abandoned carts`);
    },
    { connection: { url: config.bullmq.redisUrl } },
  );
}

export async function scheduleCartAbandonmentDetection(queue: Queue) {
  await queue.upsertJobScheduler(
    "detect-abandoned-carts",
    { pattern: "*/15 * * * *" },
    { name: "detect-abandoned" },
  );
}
