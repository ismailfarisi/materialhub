import { config } from "@materialhub/config";
import { Queue, Worker } from "bullmq";
import type { PendingOrderReaperService } from "./pending-order-reaper.service.ts";

const QUEUE_NAME = "pending-order-reaper";

let reaperQueue: Queue | null = null;

export function getPendingOrderReaperQueue(): Queue {
  if (!reaperQueue) {
    reaperQueue = new Queue(QUEUE_NAME, { connection: { url: config.bullmq.redisUrl } });
  }
  return reaperQueue;
}

export function createPendingOrderReaperWorker(service: PendingOrderReaperService) {
  return new Worker(
    QUEUE_NAME,
    async () => {
      const s = await service.reapExpired();
      console.log(
        `[pending-order-reaper] scanned=${s.scanned} cancelled=${s.cancelled} skipped=${s.skipped} errored=${s.errored}`,
      );
    },
    { connection: { url: config.bullmq.redisUrl } },
  );
}

export async function schedulePendingOrderReaper(queue: Queue) {
  await queue.upsertJobScheduler(
    "pending-order-reaper-every-5min",
    { pattern: "*/5 * * * *" },
    { name: "reap-expired-pending-orders" },
  );
}
