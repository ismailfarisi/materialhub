import { type Job, Queue, Worker } from "bullmq";
import type { LicensingService } from "../licensing.service.ts";

const QUEUE_NAME = "reels-license-expiry";
const JOB_NAME = "expireLicenseOffers";
const CRON_PATTERN = "*/15 * * * *"; // every 15 min

export class ExpireOffersJob {
  worker: Worker | null = null;
  private queue: Queue | null = null;
  constructor(
    private readonly redisUrl: string,
    private readonly licensing: LicensingService,
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
  async handle(): Promise<{ expired: number }> {
    return { expired: await this.licensing.expireDueOffers() };
  }
}
