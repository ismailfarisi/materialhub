/**
 * Daily cron: flip eligible pending commissions to `earned` and credit the
 * creator wallet. Schedules itself on the `reels-scheduled` queue at
 * 22:00 UTC = 02:00 Asia/Dubai (UTC+4), i.e. after the day rolls over locally
 * but before morning traffic.
 *
 * The handler loops CommissionService.transitionEligibleToEarned() up to 50
 * times (each call processes a batch of up to TRANSITION_BATCH_SIZE=500 rows)
 * until it sees an empty batch. Cap of 50 × 500 = 25k rows per run bounds
 * worst-case runtime while still draining any reasonable daily backlog.
 */
import { type Job, Queue, Worker } from "bullmq";
import type { CommissionService } from "../commission.service.ts";

const QUEUE_NAME = "reels-scheduled";
const JOB_NAME = "transitionPendingToEarned";
/** 22:00 UTC every day == 02:00 UAE time (UTC+4). */
const CRON_PATTERN = "0 22 * * *";
/** Hard cap on loop iterations per run; 50 × 500 batch = 25k commissions. */
const MAX_LOOPS = 50;

export interface TransitionResult {
  total: number;
}

export class TransitionPendingToEarnedJob {
  worker: Worker | null = null;
  private queue: Queue | null = null;

  constructor(
    private readonly redisUrl: string,
    private readonly commissionService: CommissionService,
  ) {}

  start(): void {
    this.queue = new Queue(QUEUE_NAME, {
      connection: { url: this.redisUrl },
    });

    void this.queue.add(
      JOB_NAME,
      {},
      {
        repeat: { pattern: CRON_PATTERN },
        removeOnComplete: 30,
        removeOnFail: 50,
      },
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

  /**
   * Public handler exposed for unit tests. Drains the backlog by calling
   * `transitionEligibleToEarned` repeatedly until either a run returns 0 or
   * we hit MAX_LOOPS. Returns the cumulative count of commissions processed.
   */
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
