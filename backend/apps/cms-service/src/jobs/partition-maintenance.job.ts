import { AppDataSource } from "@materialhub/database";
import { Queue, Worker } from "bullmq";

const QUEUE_NAME = "audit-partition-maintenance";

export class PartitionMaintenanceJob {
  private queue: Queue;
  private worker: Worker | null = null;

  constructor(private readonly redisUrl: string) {
    const connection = { url: redisUrl };
    this.queue = new Queue(QUEUE_NAME, { connection });
  }

  async start() {
    await this.queue.upsertJobScheduler(
      "partition-maintenance",
      {
        pattern: "0 3 * * 0", // Sunday 3 AM
      },
      {
        name: "maintain-partitions",
      },
    );

    this.worker = new Worker(
      QUEUE_NAME,
      async () => {
        await this.createFuturePartitions();
        console.log(JSON.stringify({ level: "info", message: "Partition maintenance complete" }));
      },
      { connection: { url: this.redisUrl } },
    );

    this.worker.on("failed", (job, err) => {
      console.error(
        JSON.stringify({
          level: "error",
          message: `Partition maintenance failed: ${err.message}`,
          jobId: job?.id,
        }),
      );
    });
  }

  private async createFuturePartitions() {
    const qr = AppDataSource.createQueryRunner();
    try {
      const now = new Date();
      for (let i = 0; i < 12; i++) {
        const start = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const end = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
        const name = `audit_log_${start.getFullYear()}_${String(start.getMonth() + 1).padStart(2, "0")}`;

        try {
          await qr.query(`
            CREATE TABLE IF NOT EXISTS "${name}" PARTITION OF audit_log
            FOR VALUES FROM ('${start.toISOString()}') TO ('${end.toISOString()}')
          `);
        } catch {
          // Partition likely already exists — safe to ignore
        }
      }
    } finally {
      await qr.release();
    }
  }
}
