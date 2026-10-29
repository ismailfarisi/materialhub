// booking-autocomplete.job.ts
//
// BullMQ Queue/Worker wiring for Phase 5 Task 5b's `booking-autocomplete`
// delayed job. Mirrors booking-auth.job.ts's Queue-singleton + thin-Worker
// shape: per-booking DELAYED jobs keyed by a stable jobId
// (`autocomplete_{bookingId}`), not a repeatable cron schedule.
import { config } from "@materialhub/config";
import { Queue, Worker } from "bullmq";
import type { BookingAutoCompleteService } from "./booking-autocomplete.service.ts";

const QUEUE_NAME = "booking-autocomplete";

let autoCompleteQueue: Queue | null = null;

export function getBookingAutoCompleteQueue(): Queue {
  if (!autoCompleteQueue) {
    autoCompleteQueue = new Queue(QUEUE_NAME, {
      connection: { url: config.bullmq.redisUrl },
      // Phase 5 final review Fix 2: money-critical retries. The auto-complete
      // job transitions the booking to `completed`, which drives capture +
      // commission accrual (BookingCompletionService via completeBooking). A
      // single order-service blip at fire time would otherwise leave the
      // booking `completed` but the capture/commission never attempted and
      // nothing to retry — the Stripe authorization then silently expires. With
      // `attempts`, a thrown job (real failure, not the graceful no-op branch)
      // is retried; completeBooking's already-`completed` re-fire path re-runs
      // the idempotent capture/accrual (skips if already done). Mirrors
      // order-service's review-rating queue precedent (getReviewRatingQueue).
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 60_000 },
      },
    });
  }
  return autoCompleteQueue;
}

export function createBookingAutoCompleteWorker(service: BookingAutoCompleteService): Worker {
  return new Worker(
    QUEUE_NAME,
    async (job) => {
      const { bookingId } = job.data as { bookingId: string };
      if (job.name === "auto-complete") {
        await service.runAutoCompleteJob(bookingId);
        return;
      }
      console.warn(
        `[booking-autocomplete] unrecognized job name "${job.name}" for booking ${bookingId}`,
      );
    },
    { connection: { url: config.bullmq.redisUrl } },
  );
}
