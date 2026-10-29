import { config } from "@materialhub/config";
import { Queue, Worker } from "bullmq";
import type { NotificationDispatcherService } from "../services/notification-dispatcher.service.ts";
import type { DispatchEvent } from "../services/notification-dispatcher.service.ts";

export const NOTIFICATION_DISPATCH_QUEUE = "notification-dispatch";
export const NOTIFICATION_DISPATCH_DLQ = "notification-dispatch-dlq";

let dispatchQueue: Queue | null = null;
let dlqQueue: Queue | null = null;

export function getNotificationDispatchQueue(): Queue {
  if (!dispatchQueue) {
    dispatchQueue = new Queue(NOTIFICATION_DISPATCH_QUEUE, {
      connection: { url: config.bullmq.redisUrl },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      },
    });
  }
  return dispatchQueue;
}

export function getNotificationDLQ(): Queue {
  if (!dlqQueue) {
    dlqQueue = new Queue(NOTIFICATION_DISPATCH_DLQ, {
      connection: { url: config.bullmq.redisUrl },
    });
  }
  return dlqQueue;
}

export function createNotificationDispatchWorker(
  dispatcher: NotificationDispatcherService,
): Worker {
  return new Worker(
    NOTIFICATION_DISPATCH_QUEUE,
    async (job) => {
      const event = job.data as DispatchEvent;
      await dispatcher.dispatch(event);
    },
    {
      connection: { url: config.bullmq.redisUrl },
      concurrency: 5,
    },
  );
}
