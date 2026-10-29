import { type Job, Queue, Worker } from "bullmq";
import type { CollabService } from "../collab.service.ts";

const QUEUE_NAME = "reels-collab-expiry";
const JOB_NAME = "expireCollabs";
const CRON_PATTERN = "*/15 * * * *"; // every 15 min, matching the brief sweep

export interface CollabExpiryResult {
  invitesExpired: number;
  applicationsExpired: number;
  opportunitiesExpired: number;
  deliveriesExpired: number;
  seedingReceiptsExpired: number;
}

/**
 * Sweeps collabs that have run out of time.
 *
 * Both sweeps run in one job rather than two: they touch the same rows, and
 * splitting them would let a seeded application be expired by one sweep while
 * the other was mid-flight over it. Ordering matters — deadlines first, then
 * unconfirmed receipts, so a creator who never received their product is not
 * also penalised for missing a deadline that never started.
 */
export class ExpireCollabsJob {
  worker: Worker | null = null;
  private queue: Queue | null = null;

  constructor(
    private readonly redisUrl: string,
    private readonly collabs: CollabService,
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
      { connection: { url: this.redisUrl }, concurrency: 1 },
    );
  }

  /** Public for unit/integration tests. */
  async handle(now = new Date()): Promise<CollabExpiryResult> {
    const due = await this.collabs.expireDueCollabs(now);
    const seedingReceiptsExpired = await this.collabs.expireStaleSeedingReceipts(now);
    return { ...due, seedingReceiptsExpired };
  }
}
