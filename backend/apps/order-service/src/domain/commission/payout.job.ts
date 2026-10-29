import { config } from "@materialhub/config";
import { Queue, Worker } from "bullmq";
import type { PayoutService } from "./payout.service.ts";

export const PAYOUT_QUEUE = "vendor-payouts";

export type PayoutJobData =
  | {
      type: "create";
      vendorId: string;
      // Carried for backwards-compat with older enqueued payloads — unused:
      // createDraft looks the vendor's bank account and Stripe account up
      // itself so the draft always reflects current data.
      bankAccountId?: string;
      stripeAccountId?: string;
      periodStart: string;
      periodEnd: string;
      adminUserId?: string | null;
      force?: boolean;
    }
  | {
      type: "retry";
      payoutId: string;
      adminUserId: string;
      /**
       * R3-C1: Stripe idempotency anchor, minted once per OPERATOR retry by
       * PayoutService.retry(). Stable across every BullMQ attempt of this
       * job, distinct across separate admin retries. Optional only for
       * legacy payloads already on the queue — those fall back to the job id
       * below, which is equally stable per job.
       */
      retryToken?: string;
    }
  | {
      // The only path that moves money: transfers an already-approved draft's
      // stored net_amount. See PayoutService.executeApprovedTransfer.
      type: "transfer";
      payoutId: string;
      adminUserId: string;
    }
  // Backwards-compat: legacy jobs without `type` are treated as `create`
  | {
      vendorId: string;
      bankAccountId: string;
      stripeAccountId: string;
      periodStart: string;
      periodEnd: string;
    };

export function createPayoutWorker(payoutService: PayoutService): Worker {
  return new Worker<PayoutJobData>(
    PAYOUT_QUEUE,
    async (job) => {
      const data = job.data as any;
      if (data.type === "retry") {
        await payoutService.executeRetryAndAudit(
          data.payoutId,
          data.retryToken ?? (job.id != null ? `job-${job.id}` : undefined),
        );
      } else if (data.type === "transfer") {
        await payoutService.executeApprovedTransfer(data.payoutId);
      } else {
        await payoutService.executeCreateAndAudit({
          vendorId: data.vendorId,
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
          adminUserId: data.adminUserId ?? null,
          force: data.force,
        });
      }
    },
    {
      connection: { url: config.bullmq.redisUrl },
      concurrency: 1,
    },
  );
}

let payoutQueue: Queue | null = null;

export function getPayoutQueue(): Queue {
  if (!payoutQueue) {
    payoutQueue = new Queue(PAYOUT_QUEUE, {
      connection: { url: config.bullmq.redisUrl },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      },
    });
  }
  return payoutQueue;
}
