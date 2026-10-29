import { config } from "@materialhub/config";
/**
 * Channel conversion event publisher.
 *
 * Thin wrapper around a BullMQ `channel-conversion-events` queue. This is
 * one event per master order — the integration-service conversion worker fans
 * out to each enabled sales channel that supports conversions (Phase 1b:
 * Google Ads Enhanced Conversions Adjustment; Phase 2+: Meta CAPI, TikTok
 * Events API).
 *
 * There is intentionally no event bus here — direct BullMQ publishing is the
 * established pattern. Call sites MUST wrap this in `.catch(...)` and swallow
 * the error: a transient queue publish failure must never block the order
 * flow.
 */
import { Queue } from "bullmq";

export const CHANNEL_CONVERSION_EVENTS_QUEUE = "channel-conversion-events";

type QueueFactory = () => Queue;

let queueSingleton: Queue | null = null;

const defaultFactory: QueueFactory = () =>
  new Queue(CHANNEL_CONVERSION_EVENTS_QUEUE, {
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

export async function publishOrderPaidForChannels(orderId: string): Promise<void> {
  await getQueue().add("recordChannelConversion", { orderId }, JOB_OPTS);
}
