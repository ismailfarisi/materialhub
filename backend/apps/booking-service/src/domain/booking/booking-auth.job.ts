// booking-auth.job.ts
//
// BullMQ Queue/Worker wiring for Task 7b's `booking-auth` delayed job.
// Mirrors booking-reaper.job.ts / cart-abandonment-reminder.job.ts's
// Queue-singleton + thin-Worker shape, but this queue carries per-booking
// DELAYED jobs keyed by a stable jobId (`auth:{bookingId}` /
// `auth-followup:{bookingId}`) rather than a repeatable cron schedule — the
// same `{delay, jobId}` idiom apps/product-service/src/domain/flash-deal
// /effects.ts already uses for its per-deal expiry job.
import { config } from "@materialhub/config";
import { Queue, Worker } from "bullmq";
import type { BookingAuthService } from "./booking-auth.service.ts";

const QUEUE_NAME = "booking-auth";

let authQueue: Queue | null = null;

/**
 * PHASE 7 REVIEW FIX #3 — money-critical retries for BOTH job names on this
 * queue (`authorize` and `follow-up-cancel`).
 *
 * THE BUG THIS CLOSES: the queue was constructed with no `defaultJobOptions`,
 * so BullMQ defaulted to `attempts: 1`. `BookingAuthService.runAuthorizeJob`
 * opens with a `bookingRepo.findOne` that sits OUTSIDE any try/catch, so a
 * single DB hiccup at fire time threw straight out of the worker and
 * PERMANENTLY lost that booking's prepay off-session authorization — no
 * retry, no notification, no re-schedule. The prepay booking then reached
 * completion with nothing authorized (see also fix #4 in
 * booking-completion.service.ts, which is the second half of that same
 * failure). `follow-up-cancel` has the same exposure: losing it means a
 * booking whose auth failed is never auto-cancelled and its slot is never
 * freed.
 *
 * Exported as a named constant so the CI unit suite can assert the policy
 * without constructing a Queue (which would need a live Redis). Mirrors the
 * sibling `booking-autocomplete` queue's policy verbatim
 * (getBookingAutoCompleteQueue) — the two are the same class of
 * money-critical per-booking delayed job and must not drift.
 */
export const BOOKING_AUTH_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 60_000 },
};

export function getBookingAuthQueue(): Queue {
  if (!authQueue) {
    authQueue = new Queue(QUEUE_NAME, {
      connection: { url: config.bullmq.redisUrl },
      defaultJobOptions: BOOKING_AUTH_JOB_OPTIONS,
    });
  }
  return authQueue;
}

export function createBookingAuthWorker(service: BookingAuthService): Worker {
  return new Worker(
    QUEUE_NAME,
    async (job) => {
      const { bookingId } = job.data as { bookingId: string };
      if (job.name === "authorize") {
        await service.runAuthorizeJob(bookingId);
        return;
      }
      if (job.name === "follow-up-cancel") {
        await service.runFollowUpCancelJob(bookingId);
        return;
      }
      console.warn(`[booking-auth] unrecognized job name "${job.name}" for booking ${bookingId}`);
    },
    { connection: { url: config.bullmq.redisUrl } },
  );
}
