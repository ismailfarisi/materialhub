import { config } from "@materialhub/config";
/**
 * Affiliate commission event publisher.
 *
 * Thin wrapper around a BullMQ `affiliate-commissions` queue. `order-status.service`
 * (and `order-confirmation.service`'s `markOrderPaid`) call these three functions
 * when the master order transitions to paid / delivered / refunded so that the
 * affiliate-commission workers can snapshot, mark eligible, or void commissions
 * for vendor affiliate-link attributions.
 *
 * There is intentionally no event bus here — direct BullMQ publishing is the
 * same pattern used for reels commissions. Call sites MUST wrap these in
 * `.catch(...)` and swallow the error: a transient queue publish failure must
 * never block the order flow.
 */
import { Queue } from "bullmq";

export const AFFILIATE_COMMISSIONS_QUEUE = "affiliate-commissions";

type QueueFactory = () => Queue;

let queueSingleton: Queue | null = null;

const defaultFactory: QueueFactory = () =>
  new Queue(AFFILIATE_COMMISSIONS_QUEUE, {
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

export async function publishOrderPaidForAffiliates(orderId: string): Promise<void> {
  await getQueue().add("snapshotAffiliateCommissions", { orderId }, JOB_OPTS);
}

export async function publishOrderDeliveredForAffiliates(orderId: string): Promise<void> {
  await getQueue().add("setAffiliateEligibility", { orderId }, JOB_OPTS);
}

export async function publishOrderRefundedForAffiliates(orderId: string): Promise<void> {
  await getQueue().add("voidAffiliateCommissions", { orderId }, JOB_OPTS);
}
