/**
 * Reels post-delivery nudge event publisher.
 *
 * Thin wrapper around a BullMQ `reels-nudges` queue. `order-status.service`
 * calls publishOrderDeliveredForNudge when the master order transitions to
 * `delivered`, so reels-service's NudgeEventJobs worker can evaluate
 * eligibility and fire the single-touch notification.
 *
 * Pattern matches reels-commission-events.ts: direct BullMQ publishing,
 * no event bus, call sites MUST `.catch(...)` and swallow errors — a
 * transient queue failure must never block the order flow.
 */
import { config } from "@materialhub/config";
import { Queue } from "bullmq";

export const REELS_NUDGES_QUEUE = "reels-nudges";

type QueueFactory = () => Queue;

let queueSingleton: Queue | null = null;

const defaultFactory: QueueFactory = () =>
  new Queue(REELS_NUDGES_QUEUE, {
    connection: { url: config.bullmq.redisUrl },
  });

let factory: QueueFactory = defaultFactory;

function getQueue(): Queue {
  if (!queueSingleton) {
    queueSingleton = factory();
  }
  return queueSingleton;
}

/**
 * Test-only hook: swap the queue factory and reset the cached singleton.
 * Production code must never call this.
 */
export function __setQueueFactoryForTests(fn: QueueFactory | null): void {
  factory = fn ?? defaultFactory;
  queueSingleton = null;
}

const JOB_OPTS = { removeOnComplete: 1000, attempts: 5 } as const;

export async function publishOrderDeliveredForNudge(
  orderId: string,
  userId: string,
): Promise<void> {
  await getQueue().add("sendPostDeliveryReelNudge", { orderId, userId }, JOB_OPTS);
}
