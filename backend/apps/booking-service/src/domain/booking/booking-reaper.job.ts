import { config } from "@materialhub/config";
import { Queue, Worker } from "bullmq";
import type { BookingReaperService } from "./booking-reaper.service.ts";

const QUEUE_NAME = "booking-reaper";

let reaperQueue: Queue | null = null;

export function getBookingReaperQueue(): Queue {
  if (!reaperQueue) {
    reaperQueue = new Queue(QUEUE_NAME, { connection: { url: config.bullmq.redisUrl } });
  }
  return reaperQueue;
}

export function createBookingReaperWorker(service: BookingReaperService) {
  return new Worker(
    QUEUE_NAME,
    async () => {
      const s = await service.reapExpired();
      console.log(
        `[booking-reaper] scanned=${s.scanned} expired=${s.expired} skipped=${s.skipped} errored=${s.errored}`,
      );
    },
    { connection: { url: config.bullmq.redisUrl } },
  );
}

export async function scheduleBookingReaper(queue: Queue) {
  await queue.upsertJobScheduler(
    "booking-reaper-every-5min",
    { pattern: "*/5 * * * *" },
    { name: "reap-expired-pending-bookings" },
  );
}
