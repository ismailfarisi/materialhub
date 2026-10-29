// booking-reminder.job.ts
//
// BullMQ Queue/Worker wiring for Phase 5 Task 6's `booking-reminder` delayed
// jobs. Mirrors booking-autocomplete.job.ts's Queue-singleton + thin-Worker
// shape: per-booking DELAYED jobs keyed by a stable jobId
// (`reminder_{bookingId}_{offset}`), not a repeatable cron schedule.
//
// Also owns the local reference to the shared cross-service
// "notification-events" queue — the same pattern order-service's
// container.ts / product-service's container.ts already use (each producer
// creates its OWN lightweight `Queue("notification-events", ...)` handle
// rather than importing notification-service's module; the queue NAME is the
// contract between services, not a shared TS import, since these are
// separate deployables).
import { config } from "@materialhub/config";
import { Queue, Worker } from "bullmq";
import type { ReminderScheduler } from "./reminder-scheduler.ts";

const QUEUE_NAME = "booking-reminder";
const NOTIFICATION_EVENTS_QUEUE = "notification-events";

let reminderQueue: Queue | null = null;
let notificationEventsQueue: Queue | null = null;

export function getBookingReminderQueue(): Queue {
  if (!reminderQueue) {
    reminderQueue = new Queue(QUEUE_NAME, {
      connection: { url: config.bullmq.redisUrl },
      // Phase 5 final review Fix 2: give reminder delivery the same retry
      // posture as the auto-complete queue (booking-autocomplete.job.ts). A
      // transient failure reading the booking / emitting the reminder event
      // shouldn't silently drop the customer's T-24h/T-1h reminder. Not
      // money-critical like auto-complete, but cheap and consistent. (The
      // shared cross-service "notification-events" queue below is intentionally
      // left with the producer default — order-service/product-service create
      // their own handle to it the same way, and it's the notification-service
      // consumer that owns that queue's retry policy.)
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 60_000 },
      },
    });
  }
  return reminderQueue;
}

export function getNotificationEventsQueue(): Queue {
  if (!notificationEventsQueue) {
    notificationEventsQueue = new Queue(NOTIFICATION_EVENTS_QUEUE, {
      connection: { url: config.bullmq.redisUrl },
    });
  }
  return notificationEventsQueue;
}

export function createBookingReminderWorker(scheduler: ReminderScheduler): Worker {
  return new Worker(
    QUEUE_NAME,
    async (job) => {
      // `expectedStartsAt` is the slot fingerprint the scheduler stamps on the
      // job (see reminder-scheduler.ts's reminderJobId doc comment). Optional:
      // jobs enqueued by a pre-slot-versioning deploy don't carry it, and
      // runReminderJob falls back to the status-only guard for those.
      const { bookingId, offset, expectedStartsAt } = job.data as {
        bookingId: string;
        offset: string;
        expectedStartsAt?: string;
      };
      if (job.name === "send-reminder") {
        await scheduler.runReminderJob(bookingId, offset, expectedStartsAt);
        return;
      }
      console.warn(
        `[booking-reminder] unrecognized job name "${job.name}" for booking ${bookingId}`,
      );
    },
    { connection: { url: config.bullmq.redisUrl } },
  );
}
