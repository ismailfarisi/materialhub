import { type Job, Queue, Worker } from "bullmq";
import type { AffiliateCommissionService } from "../services/affiliate-commission.service.ts";

const QUEUE_NAME = "affiliate-scheduled";
const JOB_NAME = "transitionAffiliatePendingToEarned";
const CRON_PATTERN = "0 22 * * *"; // 02:00 UAE (UTC+4)
const MAX_LOOPS = 50;

export interface TransitionResult {
  total: number;
}

/**
 * Daily cron that sweeps `pending` affiliate commissions past their
 * `eligible_at` return window into `earned` (crediting the affiliate
 * wallet). Loops the batched service call until a sweep processes zero
 * rows, bounded by `MAX_LOOPS` so a runaway backlog can't loop forever.
 */
export class TransitionAffiliatePendingToEarnedJob {
  worker: Worker | null = null;
  private queue: Queue | null = null;

  constructor(
    private readonly redisUrl: string,
    private readonly commissionService: AffiliateCommissionService,
  ) {}

  start(): void {
    this.queue = new Queue(QUEUE_NAME, { connection: { url: this.redisUrl } });
    void this.queue.add(
      JOB_NAME,
      {},
      { repeat: { pattern: CRON_PATTERN }, removeOnComplete: 30, removeOnFail: 50 },
    );
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        if (job.name !== JOB_NAME) return undefined;
        return await this.handle();
      },
      { connection: { url: this.redisUrl } },
    );
  }

  async handle(): Promise<TransitionResult> {
    let total = 0;
    for (let i = 0; i < MAX_LOOPS; i++) {
      const processed = await this.commissionService.transitionEligibleToEarned();
      if (!processed) break;
      total += processed;
    }
    return { total };
  }
}
