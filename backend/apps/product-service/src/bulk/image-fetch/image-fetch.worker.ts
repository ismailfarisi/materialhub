import { config } from "@materialhub/config";
import { AppDataSource, ensureDatabase } from "@materialhub/database";
import type { MediaService } from "@materialhub/utils";
import { Worker } from "bullmq";
import { ImageFetchError, downloadImage } from "./image-fetch.downloader.ts";

interface TaskPayload {
  taskRecord: {
    jobId: string;
    rowNumber: number;
    productId: string;
    variantId: string | null;
    sourceUrl: string;
    sortOrder: number;
  };
  taskId?: string;
}

export interface ImageWorkerDeps {
  mediaService: MediaService;
}

function mimeToExt(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "jpg";
}

/**
 * Resets task rows left in `status='running'` by a worker that died mid-task
 * (deploy, OOM, BullMQ stalled-job kill). Without this, the row stays at
 * `running` forever — `last_error` is NULL, the row never appears in the
 * "Failed images" tab, and the existing retry button (which targets
 * status='failed') can't recover it.
 *
 * We only touch rows whose parent job has already reached a terminal status
 * (`completed`, `failed`, `cancelled`), so we never race with a currently-
 * active job. The 5-minute updated_at floor is a belt-and-braces guard against
 * a worker restart that races with a job that flipped to `completed` between
 * our query and the UPDATE.
 *
 * Reset to `status='failed'` (not `queued`) so admins can review them in the
 * UI and retry deliberately rather than silently re-running on every boot.
 */
async function recoverOrphanedRunningTasks(): Promise<void> {
  // TypeORM 0.3.28's query() returns `[rows, rowCount]` for UPDATE/DELETE
  // (SELECT/INSERT return a flat rows array). Destructure the rows array.
  const [rows] = (await AppDataSource.query(
    `UPDATE bulk_import_job_image_tasks SET status = 'failed',
            last_error = COALESCE(last_error, 'orphaned: worker interrupted before completion'),
            updated_at = now()
     WHERE status = 'running'
       AND updated_at < now() - interval '5 minutes'
       AND job_id IN (
         SELECT id FROM bulk_import_jobs
         WHERE status IN ('completed', 'failed', 'cancelled')
       )
     RETURNING job_id`,
  )) as [Array<{ job_id: string }>, number];
  if (rows.length === 0) return;

  const perJob = new Map<string, number>();
  for (const r of rows as Array<{ job_id: string }>) {
    perJob.set(r.job_id, (perJob.get(r.job_id) ?? 0) + 1);
  }
  for (const [jobId, count] of perJob) {
    await AppDataSource.query(
      "UPDATE bulk_import_jobs SET images_failed = images_failed + $2 WHERE id = $1",
      [jobId, count],
    );
  }
  console.log(
    `[bulk-image-fetch-worker] recovered ${rows.length} orphaned 'running' task(s) across ${perJob.size} job(s)`,
  );
}

export async function startImageFetchWorker(deps: ImageWorkerDeps): Promise<Worker> {
  // container.ts spawns this worker at module-load, before index.ts awaits
  // ensureDatabase(). Wait for the DB to be ready before sweeping, otherwise
  // AppDataSource.query throws "Driver not Connected".
  await ensureDatabase();
  await recoverOrphanedRunningTasks().catch((e) =>
    console.error("[bulk-image-fetch-worker] recovery sweep failed", e),
  );

  const worker = new Worker(
    "bulk-import-image-fetch",
    async (bullJob) => {
      const { taskRecord } = bullJob.data as TaskPayload;

      // Upsert the task row
      let taskId: string;
      const existing = await AppDataSource.query(
        "SELECT id FROM bulk_import_job_image_tasks WHERE job_id = $1 AND source_url = $2 AND product_id = $3 AND variant_id IS NOT DISTINCT FROM $4",
        [taskRecord.jobId, taskRecord.sourceUrl, taskRecord.productId, taskRecord.variantId],
      );
      if (existing.length > 0) {
        taskId = existing[0].id;
        await AppDataSource.query(
          `UPDATE bulk_import_job_image_tasks SET status = 'running', attempt_count = attempt_count + 1, updated_at = now() WHERE id = $1`,
          [taskId],
        );
      } else {
        const ins = await AppDataSource.query(
          `INSERT INTO bulk_import_job_image_tasks (job_id, row_number, product_id, variant_id, source_url, sort_order, status, attempt_count)
           VALUES ($1,$2,$3,$4,$5,$6,'running',1) RETURNING id`,
          [
            taskRecord.jobId,
            taskRecord.rowNumber,
            taskRecord.productId,
            taskRecord.variantId,
            taskRecord.sourceUrl,
            taskRecord.sortOrder,
          ],
        );
        taskId = ins[0].id;
      }

      try {
        const downloaded = await downloadImage(taskRecord.sourceUrl);

        const baseKey = `products/${taskRecord.productId}/${taskId}`;
        const rawKey = `${baseKey}/original.${mimeToExt(downloaded.contentType)}`;
        await deps.mediaService.uploadBuffer(rawKey, downloaded.buffer, downloaded.contentType);

        // Pass taskId as the variant uuid so concurrent image tasks for the
        // same product don't all write to `processed/{productId}/...` and
        // overwrite each other. Without this, all N product_images rows for
        // a product end up pointing to whichever task finished last.
        const processed = await deps.mediaService.processImage(rawKey, taskId);

        const imgRow = await AppDataSource.query(
          `INSERT INTO product_images (product_id, variant_id, url, thumbnail_url, card_url, medium_url, sort_order, is_primary, alt_text)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [
            taskRecord.productId,
            taskRecord.variantId,
            processed.large.url,
            processed.thumb.url,
            processed.card.url,
            processed.medium.url,
            taskRecord.sortOrder,
            taskRecord.sortOrder === 0,
            null,
          ],
        );
        const productImageId = imgRow[0].id;

        await AppDataSource.query(
          `UPDATE bulk_import_job_image_tasks SET status = 'succeeded', product_image_id = $1, updated_at = now() WHERE id = $2`,
          [productImageId, taskId],
        );
        await AppDataSource.query(
          "UPDATE bulk_import_jobs SET images_processed = images_processed + 1 WHERE id = $1",
          [taskRecord.jobId],
        );
      } catch (err) {
        const code = err instanceof ImageFetchError ? err.code : "unknown";
        const msg = (err as Error).message;
        const attempt = (
          await AppDataSource.query(
            "SELECT attempt_count FROM bulk_import_job_image_tasks WHERE id = $1",
            [taskId],
          )
        )[0].attempt_count;
        if (attempt < 3) {
          await AppDataSource.query(
            `UPDATE bulk_import_job_image_tasks SET status = 'retrying', last_error = $1, updated_at = now() WHERE id = $2`,
            [`${code}: ${msg}`, taskId],
          );
          throw new Error("retry");
        }
        await AppDataSource.query(
          `UPDATE bulk_import_job_image_tasks SET status = 'failed', last_error = $1, updated_at = now() WHERE id = $2`,
          [`${code}: ${msg}`, taskId],
        );
        await AppDataSource.query(
          "UPDATE bulk_import_jobs SET images_failed = images_failed + 1 WHERE id = $1",
          [taskRecord.jobId],
        );
      }
    },
    {
      connection: { url: config.bullmq.redisUrl },
      concurrency: 10,
    },
  );

  worker.on("error", (e) => console.error("[bulk-image-fetch-worker]", e));
  return worker;
}
