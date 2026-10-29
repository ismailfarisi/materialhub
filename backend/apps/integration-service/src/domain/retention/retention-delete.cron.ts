import { config } from "@materialhub/config";
import { AppDataSource, SiteSetting } from "@materialhub/database";
import { Queue, Worker } from "bullmq";

export const RETENTION_DELETE_QUEUE = "integration-retention-delete-cron";

export const DEFAULT_RETENTION_DAYS = 365;

export function cutoffFromDays(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

export async function readRetentionDays(): Promise<number> {
  const repo = AppDataSource.getRepository(SiteSetting);
  const row = await repo.findOne({
    where: { key: "data_retention_integration_total_days" } as any,
  });
  if (!row?.value) return DEFAULT_RETENTION_DAYS;
  const parsed = Number.parseInt(row.value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RETENTION_DAYS;
}

export interface SweepResult {
  cutoff: string;
  vendor_integration_deliveries: number;
  channel_deliveries: number;
  channel_feed_runs: number;
}

export async function sweepIntegrationData(
  cutoff: Date,
  ds: { query: (sql: string, params: unknown[]) => Promise<unknown> } = AppDataSource,
): Promise<SweepResult> {
  const del = async (table: string): Promise<number> => {
    // biome-ignore lint/suspicious/noExplicitAny: raw TypeORM result shape varies
    const result: any = await ds.query(`DELETE FROM ${table} WHERE created_at < $1`, [cutoff]);
    return Array.isArray(result) ? Number(result[1] ?? 0) : 0;
  };
  const vendor = await del("vendor_integration_deliveries");
  const deliveries = await del("channel_deliveries");
  const runs = await del("channel_feed_runs");
  return {
    cutoff: cutoff.toISOString(),
    vendor_integration_deliveries: vendor,
    channel_deliveries: deliveries,
    channel_feed_runs: runs,
  };
}

export function getRetentionDeleteQueue(): Queue {
  return new Queue(RETENTION_DELETE_QUEUE, { connection: { url: config.bullmq.redisUrl } });
}

export function createRetentionDeleteWorker(): Worker {
  return new Worker(
    RETENTION_DELETE_QUEUE,
    async () => {
      const days = await readRetentionDays();
      const cutoff = cutoffFromDays(days);
      const result = await sweepIntegrationData(cutoff);
      // biome-ignore lint/suspicious/noConsole: structured retention log
      console.log(
        JSON.stringify({
          evt: "retention-delete.swept",
          cutoff: result.cutoff,
          vendor_integration_deliveries: result.vendor_integration_deliveries,
          channel_deliveries: result.channel_deliveries,
          channel_feed_runs: result.channel_feed_runs,
        }),
      );
    },
    { connection: { url: config.bullmq.redisUrl }, concurrency: 1 },
  );
}

export async function scheduleRetentionDeleteCron(queue: Queue): Promise<void> {
  await queue.add(
    "sweep",
    {},
    { repeat: { pattern: "0 3 1 * *" }, removeOnComplete: true, removeOnFail: true },
  );
}
