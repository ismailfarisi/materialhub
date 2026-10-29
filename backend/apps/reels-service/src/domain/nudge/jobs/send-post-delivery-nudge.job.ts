/**
 * BullMQ worker consuming `sendPostDeliveryReelNudge` jobs from the
 * `reels-nudges` queue. Published by order-service when a master order
 * transitions to `delivered` (see reels-nudge-events.ts in order-service).
 *
 * Single responsibility: dispatch on job.name and delegate to
 * PostDeliveryNudgeService.sendIfEligible. `handle()` is exposed public so
 * unit tests can exercise the dispatch without spinning up real Redis.
 * Matches the CommerceEventJobs pattern in ../commerce/jobs/commerce-event-jobs.ts.
 */
import { type Job, Worker } from "bullmq";
import type { PostDeliveryNudgeService } from "../post-delivery-nudge.service.ts";

export const REELS_NUDGES_QUEUE = "reels-nudges";

export const NUDGE_JOB_NAMES = {
  sendPostDeliveryReelNudge: "sendPostDeliveryReelNudge",
} as const;

export interface NudgeJobPayload {
  orderId: string;
  userId: string;
}

export class NudgeEventJobs {
  worker: Worker | null = null;

  constructor(
    private readonly redisUrl: string,
    private readonly nudgeService: PostDeliveryNudgeService,
  ) {}

  start(): void {
    this.worker = new Worker(
      REELS_NUDGES_QUEUE,
      async (job: Job<NudgeJobPayload>) => {
        await this.handle(job);
      },
      {
        connection: { url: this.redisUrl },
        concurrency: 5,
      },
    );
  }

  /**
   * Public handler for unit tests. Silently ignores unknown job names so a
   * rolling deploy with mismatched schemas won't DLQ old jobs.
   */
  async handle(job: Pick<Job<NudgeJobPayload>, "name" | "data">): Promise<void> {
    const payload = job.data ?? ({} as NudgeJobPayload);
    if (!payload.orderId || !payload.userId) return;
    switch (job.name) {
      case NUDGE_JOB_NAMES.sendPostDeliveryReelNudge:
        await this.nudgeService.sendIfEligible({
          orderId: payload.orderId,
          userId: payload.userId,
        });
        return;
      default:
        return;
    }
  }
}
