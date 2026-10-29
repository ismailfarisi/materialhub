import { config } from "@materialhub/config";
import { Queue } from "bullmq";

let parentQueue: Queue | null = null;
let imageFetchQueue: Queue | null = null;
let productExportQueue: Queue | null = null;

export function getBulkParentQueue(): Queue {
  if (!parentQueue) {
    parentQueue = new Queue("bulk-import-parent", {
      connection: { url: config.bullmq.redisUrl },
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 30_000 },
      },
    });
  }
  return parentQueue;
}

export function getBulkImageFetchQueue(): Queue {
  if (!imageFetchQueue) {
    imageFetchQueue = new Queue("bulk-import-image-fetch", {
      connection: { url: config.bullmq.redisUrl },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 30_000 },
      },
    });
  }
  return imageFetchQueue;
}

export function getProductExportQueue(): Queue {
  if (!productExportQueue) {
    productExportQueue = new Queue("product-export", {
      connection: { url: config.bullmq.redisUrl },
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 30_000 },
      },
    });
  }
  return productExportQueue;
}
