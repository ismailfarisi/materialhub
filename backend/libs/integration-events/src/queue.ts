import { config } from "@materialhub/config";
import { Queue } from "bullmq";

export const INTEGRATION_EVENTS_QUEUE = "integration-events";

let queue: Queue | null = null;

export function getIntegrationEventsQueue(): Queue {
  if (!queue) {
    queue = new Queue(INTEGRATION_EVENTS_QUEUE, {
      connection: { url: config.bullmq.redisUrl },
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: { age: 86_400, count: 1000 },
        removeOnFail: false,
      },
    });
  }
  return queue;
}
