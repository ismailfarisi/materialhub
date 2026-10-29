import { AppDataSource, Order } from "@materialhub/database";
import { type Job, Worker } from "bullmq";
import type { AffiliateCommissionService } from "../services/affiliate-commission.service.ts";

const QUEUE_NAME = "affiliate-commissions";
const DEFAULT_RETURN_WINDOW_DAYS = 7;

export const AFFILIATE_JOB_NAMES = {
  snapshotAffiliateCommissions: "snapshotAffiliateCommissions",
  setAffiliateEligibility: "setAffiliateEligibility",
  voidAffiliateCommissions: "voidAffiliateCommissions",
} as const;

export interface AffiliateJobPayload {
  orderId: string;
}

/**
 * Worker for order-lifecycle events that drive the affiliate commission
 * state machine: snapshot at order-paid, eligibility at delivery, void on
 * refund. Mirrors `commerce-event-jobs.ts` (reels-service) but dispatches
 * to `AffiliateCommissionService` instead of the creator commission path.
 */
export class AffiliateCommerceEventJobs {
  worker: Worker | null = null;

  constructor(
    private readonly redisUrl: string,
    private readonly commissionService: AffiliateCommissionService,
  ) {}

  start(): void {
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job<AffiliateJobPayload>) => {
        await this.handle(job);
      },
      { connection: { url: this.redisUrl }, concurrency: 5 },
    );
  }

  async handle(job: Pick<Job<AffiliateJobPayload>, "name" | "data">): Promise<void> {
    const { orderId } = job.data ?? ({} as AffiliateJobPayload);
    if (!orderId) return;
    switch (job.name) {
      case AFFILIATE_JOB_NAMES.snapshotAffiliateCommissions:
        await this.commissionService.snapshotForOrder(orderId);
        return;
      case AFFILIATE_JOB_NAMES.setAffiliateEligibility: {
        const order = await AppDataSource.getRepository(Order).findOne({ where: { id: orderId } });
        if (!order) return;
        const deliveredAt = order.delivered_at ?? new Date();
        await this.commissionService.setEligibility(
          orderId,
          deliveredAt,
          DEFAULT_RETURN_WINDOW_DAYS,
        );
        return;
      }
      case AFFILIATE_JOB_NAMES.voidAffiliateCommissions:
        await this.commissionService.voidPendingForOrder(orderId, "order_refunded");
        return;
      default:
        return;
    }
  }
}
