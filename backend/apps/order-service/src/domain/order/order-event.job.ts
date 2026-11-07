import { config } from "@materialhub/config";
import { Queue, Worker } from "bullmq";

export const ORDER_EVENT_QUEUE = "order-events";

export interface OrderStatusChangedEvent {
  type: "order.status.changed";
  orderId: string;
  vendorOrderId?: string;
  /** Vendor of the sub-order, on vendor-order events. */
  vendorId?: string;
  orderItemId?: string;
  fromStatus: string;
  toStatus: string;
  parentOrderStatus?: string;
  actorId: string;
  actorRole: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export const DEADLINE_CHECK_QUEUE = "vendor-order-deadline";

export interface DeadlineCheckJob {
  vendorOrderId: string;
  vendorId: string;
  orderId: string;
}

let deadlineQueue: Queue | null = null;

export function getDeadlineCheckQueue(): Queue {
  if (!deadlineQueue) {
    deadlineQueue = new Queue(DEADLINE_CHECK_QUEUE, {
      connection: { url: config.bullmq.redisUrl },
    });
  }
  return deadlineQueue;
}

export function createDeadlineWorker(vendorOrderRepo: any, orderEventQueue: Queue): Worker {
  return new Worker(
    DEADLINE_CHECK_QUEUE,
    async (job) => {
      const { vendorOrderId, vendorId, orderId } = job.data as DeadlineCheckJob;
      const vo = await vendorOrderRepo.findOne({ where: { id: vendorOrderId } });
      if (!vo || vo.status !== "confirmed") return; // Already processed, skip

      await orderEventQueue.add("order.vendor.deadline_expired", {
        type: "order.vendor.deadline_expired",
        orderId,
        vendorOrderId,
        vendorId,
        timestamp: new Date().toISOString(),
      });
    },
    { connection: { url: config.bullmq.redisUrl }, concurrency: 1 },
  );
}

let orderEventQueue: Queue | null = null;

export function getOrderEventQueue(): Queue {
  if (!orderEventQueue) {
    orderEventQueue = new Queue(ORDER_EVENT_QUEUE, {
      connection: { url: config.bullmq.redisUrl },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      },
    });
  }
  return orderEventQueue;
}
