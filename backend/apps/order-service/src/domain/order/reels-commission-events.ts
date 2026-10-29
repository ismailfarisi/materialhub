import { config } from "@materialhub/config";
/**
 * Reels commission event publisher.
 *
 * Thin wrapper around a BullMQ `reels-commissions` queue. `order-status.service`
 * calls these three functions when the master order transitions to paid /
 * delivered / refunded so that the reels-service commission workers (M3 Task 6)
 * can create, mark eligible, or void commissions for creator attributions.
 *
 * There is intentionally no event bus here — direct BullMQ publishing is the
 * M3 pattern. Call sites MUST wrap these in `.catch(...)` and swallow the
 * error: a transient queue publish failure must never block the order flow.
 */
import { Queue } from "bullmq";

export const REELS_COMMISSIONS_QUEUE = "reels-commissions";

type QueueFactory = () => Queue;

let queueSingleton: Queue | null = null;

const defaultFactory: QueueFactory = () =>
  new Queue(REELS_COMMISSIONS_QUEUE, {
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

export async function publishOrderPaidForCommissions(orderId: string): Promise<void> {
  await getQueue().add("createCommissionsFromOrder", { orderId }, JOB_OPTS);
}

export async function publishOrderDeliveredForCommissions(orderId: string): Promise<void> {
  await getQueue().add("setCommissionEligibility", { orderId }, JOB_OPTS);
}

export async function publishOrderRefundedForCommissions(orderId: string): Promise<void> {
  await getQueue().add("voidCommissionsOnRefund", { orderId }, JOB_OPTS);
}
