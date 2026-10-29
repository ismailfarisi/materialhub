import { type Job, Queue, Worker } from "bullmq";
import type { NotifierClient } from "../../nudge/post-delivery-nudge.service.ts";
import type { CollabService } from "../collab.service.ts";

const QUEUE_NAME = "reels-collab-reminders";
const JOB_NAME = "collabDeadlineReminders";
/** Once a day. A deadline reminder is not urgent enough to warrant more. */
const CRON_PATTERN = "0 9 * * *";

/** Days before `deliver_by` that a creator gets a nudge. */
export const REMINDER_DAYS = [3, 1] as const;

export class CollabDeadlineRemindersJob {
  worker: Worker | null = null;
  private queue: Queue | null = null;

  constructor(
    private readonly redisUrl: string,
    private readonly collabs: CollabService,
    private readonly notifier: NotifierClient,
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

  /**
   * Public for unit/integration tests.
   *
   * A failed send is swallowed per-recipient: one creator's broken email address
   * must not stop everyone else's reminder, and a reminder is not worth failing
   * the job over. The count returned is sends that actually succeeded.
   */
  async handle(now = new Date()): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;
    for (const days of REMINDER_DAYS) {
      const due = await this.collabs.findUpcomingDeadlines(days, now);
      for (const row of due) {
        try {
          await this.notifier.send({
            userId: row.creatorId,
            type: "collab_deadline_reminder",
            data: {
              application_id: row.applicationId,
              opportunity_id: row.opportunityId,
              days_remaining: days,
            },
          });
          sent++;
        } catch {
          failed++;
        }
      }
    }
    return { sent, failed };
  }
}
