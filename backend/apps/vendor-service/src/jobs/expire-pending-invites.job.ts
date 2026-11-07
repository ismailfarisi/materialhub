import { AppDataSource } from "@materialhub/database";
import { Queue, Worker } from "bullmq";
import { returningRows } from "../lib/returning-rows.ts";

const QUEUE_NAME = "vendor-expire-pending-invites";

export class ExpirePendingInvitesJob {
  private queue: Queue;
  private worker: Worker | null = null;

  constructor(private readonly redisUrl: string) {
    const connection = { url: redisUrl };
    this.queue = new Queue(QUEUE_NAME, { connection });
  }

  async start() {
    await this.queue.upsertJobScheduler(
      "daily-expire-invites",
      {
        pattern: "0 3 * * *", // Daily at 03:00 UTC
      },
      {
        name: "run",
      },
    );

    this.worker = new Worker(
      QUEUE_NAME,
      async () => {
        const result = await ExpirePendingInvitesJob.run();
        console.log(
          JSON.stringify({
            level: "info",
            message: "expired_invites_swept",
            count: result.count,
            timestamp: new Date().toISOString(),
          }),
        );
      },
      { connection: { url: this.redisUrl } },
    );

    this.worker.on("failed", (job, err) => {
      console.error(
        JSON.stringify({
          level: "error",
          message: `expire_pending_invites failed: ${err.message}`,
          jobId: job?.id,
        }),
      );
    });
  }

  /**
   * Pure data operation — exposed as a static so unit tests can call it
   * without spinning up BullMQ infrastructure.
   */
  static async run(
    ds: { query: (sql: string, params?: unknown[]) => Promise<unknown> } = AppDataSource as any,
  ): Promise<{ count: number }> {
    const result = returningRows<{ id: string }>(
      await ds.query(
        `UPDATE vendor_members
          SET deleted_at = NOW(), updated_at = NOW()
        WHERE status = 'pending'
          AND deleted_at IS NULL
          AND invite_expires_at < NOW() - INTERVAL '30 days'
        RETURNING id`,
      ),
    );
    return { count: result.length };
  }
}
