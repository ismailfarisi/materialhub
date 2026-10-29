// ical-import.job.ts
//
// Phase 6 Task 4 — the BullMQ repeatable job that drives IcalImportService.poll
// every 15 minutes. Mirrors booking-reaper.job.ts (singleton getQueue, a
// createWorker taking the service, upsertJobScheduler). concurrency:1 so the
// find-then-write idempotency in IcalImportService (which assumes serial
// per-subscription work) holds. One tick iterates ALL active subscriptions
// serially inside poll() — iterate-all-per-tick, NOT one BullMQ job per
// subscription (precedent: order-service postaplus-tracking-poll.job.ts).
//
// NOTE: underscore job/scheduler ids (BullMQ rejects `:` in job ids).
import { config } from "@materialhub/config";
import { Queue, Worker } from "bullmq";
import type { IcalImportService } from "./ical-import.service.ts";

const QUEUE_NAME = "ical-import";

let icalImportQueue: Queue | null = null;

export function getIcalImportQueue(): Queue {
  if (!icalImportQueue) {
    icalImportQueue = new Queue(QUEUE_NAME, { connection: { url: config.bullmq.redisUrl } });
  }
  return icalImportQueue;
}

export function createIcalImportWorker(service: IcalImportService): Worker {
  return new Worker(
    QUEUE_NAME,
    async () => {
      // poll() defaults now=new Date() and fetch=global fetch; it wraps each
      // subscription in its own try/catch so one bad feed never fails the tick.
      await service.poll();
    },
    { connection: { url: config.bullmq.redisUrl }, concurrency: 1 },
  );
}

export async function scheduleIcalImport(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(
    "ical_import_poll",
    { pattern: "*/15 * * * *" },
    { name: "ical-import-poll" },
  );
}
