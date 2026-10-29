/**
 * Event-driven BullMQ workers bridging order-service events to
 * CommissionService. Three job names share the `reels-commissions` queue and
 * are dispatched by a single Worker on `job.name`:
 *
 *   - createCommissionsFromOrder  → snapshot pending commissions from order items
 *   - setCommissionEligibility    → stamp eligible_at once an order is delivered
 *   - voidCommissionsOnRefund     → void any pending commissions for an order
 *
 * order-service publishes to this queue from its own BullMQ Queue instance
 * (see M3 Task 7); this file only consumes. Handler logic lives in `handle()`
 * so tests can call it directly without spinning up a real Worker / Redis.
 *
 * Deviation from the plan: rather than three files each creating its own
 * Worker against the same queue, we consolidate into one dispatcher class.
 * Three parallel workers competing on one queue would be wasteful and make
 * `job.name` filtering noisy.
 */
import { AppDataSource, Order } from "@materialhub/database";
import { type Job, Worker } from "bullmq";
import type { CommissionService } from "../commission.service.ts";

const QUEUE_NAME = "reels-commissions";

export const COMMERCE_JOB_NAMES = {
  createCommissionsFromOrder: "createCommissionsFromOrder",
  setCommissionEligibility: "setCommissionEligibility",
  voidCommissionsOnRefund: "voidCommissionsOnRefund",
} as const;

/**
 * Default return window used when computing `eligible_at`. Vendor entity
 * currently carries only a free-text `return_policy`; there is no numeric
 * `return_window_days` column to read, so we apply a uniform 7-day window
 * for all vendors. Swap to a per-vendor value once the column exists.
 */
const DEFAULT_RETURN_WINDOW_DAYS = 7;

export interface CommerceJobPayload {
  orderId: string;
}

export class CommerceEventJobs {
  worker: Worker | null = null;

  constructor(
    private readonly redisUrl: string,
    private readonly commissionService: CommissionService,
  ) {}

  start(): void {
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job<CommerceJobPayload>) => {
        await this.handle(job);
      },
      {
        connection: { url: this.redisUrl },
        concurrency: 5,
      },
    );
  }

  /**
   * Public handler exposed for unit tests. Dispatches on `job.name`, silently
   * ignoring unknown names so a rolling deploy won't DLQ old-schema jobs.
   */
  async handle(job: Pick<Job<CommerceJobPayload>, "name" | "data">): Promise<void> {
    const { orderId } = job.data ?? ({} as CommerceJobPayload);
    if (!orderId) return;

    switch (job.name) {
      case COMMERCE_JOB_NAMES.createCommissionsFromOrder: {
        const order = await AppDataSource.getRepository(Order).findOne({
          where: { id: orderId },
          relations: ["items"],
        });
        if (!order) return;
        await this.commissionService.createFromOrder(order);
        return;
      }
      case COMMERCE_JOB_NAMES.setCommissionEligibility: {
        const order = await AppDataSource.getRepository(Order).findOne({
          where: { id: orderId },
          relations: ["items"],
        });
        if (!order) return;
        const deliveredAt = order.delivered_at ?? new Date();
        await this.commissionService.setEligibility(
          order.id,
          deliveredAt,
          DEFAULT_RETURN_WINDOW_DAYS,
        );
        return;
      }
      case COMMERCE_JOB_NAMES.voidCommissionsOnRefund: {
        await this.commissionService.voidPendingForOrder(orderId, "order_refunded");
        return;
      }
      default:
        // Unknown job name — no-op.
        return;
    }
  }
}
