import { config } from "@materialhub/config";
import { AppDataSource, SiteSetting } from "@materialhub/database";
import { Queue, Worker } from "bullmq";

export const SCRUB_PII_QUEUE = "integration-scrub-pii-cron";

export const DEFAULT_PII_DAYS = 90;

export async function readPiiDays(): Promise<number> {
  const repo = AppDataSource.getRepository(SiteSetting);
  const row = await repo.findOne({
    where: { key: "data_retention_integration_pii_days" } as any,
  });
  if (!row?.value) return DEFAULT_PII_DAYS;
  const parsed = Number.parseInt(row.value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PII_DAYS;
}

export async function scrubOldPII(): Promise<{ scrubbed: number; cutoff: string }> {
  const days = await readPiiDays();
  const cutoff = new Date(Date.now() - days * 86_400_000);
  // biome-ignore lint/suspicious/noExplicitAny: raw TypeORM query result shape varies
  const result: any = await AppDataSource.query(
    `
    UPDATE vendor_integration_deliveries
       SET request_body = (
         request_body
         #- '{order,user,email}'
         #- '{order,user,phone}'
         #- '{order,shipping_address}'
       )
     WHERE created_at < $1
       AND request_body IS NOT NULL
       AND (
         request_body #> '{order,user,email}' IS NOT NULL OR
         request_body #> '{order,user,phone}' IS NOT NULL OR
         request_body #> '{order,shipping_address}' IS NOT NULL
       )
    `,
    [cutoff],
  );
  const scrubbed = Array.isArray(result) ? Number(result[1] ?? 0) : 0;
  return { scrubbed, cutoff: cutoff.toISOString() };
}

export function getScrubPiiQueue(): Queue {
  return new Queue(SCRUB_PII_QUEUE, { connection: { url: config.bullmq.redisUrl } });
}

export function createScrubPiiWorker(): Worker {
  return new Worker(
    SCRUB_PII_QUEUE,
    async () => {
      const { scrubbed, cutoff } = await scrubOldPII();
      console.log("[scrub-pii] swept", { scrubbed, cutoff });
    },
    { connection: { url: config.bullmq.redisUrl }, concurrency: 1 },
  );
}

export async function scheduleScrubPiiCron(queue: Queue): Promise<void> {
  await queue.add(
    "scrub",
    {},
    { repeat: { pattern: "0 4 * * *" }, removeOnComplete: true, removeOnFail: true },
  );
}
