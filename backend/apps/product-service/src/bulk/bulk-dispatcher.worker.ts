import {
  type BulkJobEventPublisher,
  BulkJobWorker,
  type FollowUpTask,
  type JobType,
} from "@materialhub/bulk-jobs";
import { config } from "@materialhub/config";
import { AppDataSource, BulkImportJob } from "@materialhub/database";
import { getS3Client } from "@materialhub/utils";
import { Worker } from "bullmq";
import { getJobType } from "./job-type-registry.ts";
import { getBulkImageFetchQueue } from "./queues.ts";

export interface DispatcherDeps {
  publisher: BulkJobEventPublisher;
}

/**
 * Wrap the registered JobType so buildValidationContext-preloaded context is threaded
 * into coerceRow/preValidate via closure (avoids re-running heavy preload per batch).
 * writeBatch / postComplete are called as-is because their closures stay wired through
 * summary.context (see each job type's writeBatch implementation).
 */
function wrapWithPreloadedContext<T>(
  base: JobType<unknown, unknown>,
  ctx: T,
): JobType<unknown, unknown> {
  const wrapped: JobType<unknown, unknown> = {
    ...base,
    buildValidationContext: async () => ctx as never,
    coerceRow: (row) => base.coerceRow(row, ctx as never),
    preValidate: base.preValidate ? (rows) => base.preValidate!(rows, ctx as never) : undefined,
  };
  return wrapped;
}

/**
 * Mutate writeCtx.job.summary to include the preloaded context so writeBatch/postComplete
 * can reach it without changing their signatures. Mirrors Phase 1's approach.
 */
function withCtx<T>(writeCtx: { job: { summary: unknown } }, ctx: T): void {
  (writeCtx.job.summary as Record<string, unknown> | null) = {
    ...((writeCtx.job.summary as Record<string, unknown>) ?? {}),
    context: ctx,
  };
}

export async function startBulkDispatcherWorker(deps: DispatcherDeps): Promise<Worker> {
  const worker = new Worker(
    "bulk-import-parent",
    async (bullJob) => {
      const jobId: string = bullJob.data.jobId;
      const jobRow = await AppDataSource.getRepository(BulkImportJob).findOne({
        where: { id: jobId },
      });
      if (!jobRow) throw new Error(`bulk job ${jobId} missing`);

      const registered = getJobType(jobRow.job_type);
      if (!registered) {
        throw new Error(`bulk job ${jobId}: job_type ${jobRow.job_type} not registered`);
      }

      const ctx = await registered.buildValidationContext({
        dataSource: AppDataSource,
        vendorId: jobRow.vendor_id,
        importMode: jobRow.import_mode,
      });

      const wrapped = wrapWithPreloadedContext(registered, ctx);

      // Patch writeBatch/postComplete to thread ctx through summary just like Phase 1.
      const finalJobType: JobType<unknown, unknown> = {
        ...wrapped,
        writeBatch: async (rows, writeCtx) => {
          withCtx(writeCtx, ctx);
          return registered.writeBatch(rows as never, writeCtx);
        },
        postComplete: registered.postComplete
          ? async (writeCtx) => {
              withCtx(writeCtx, ctx);
              return registered.postComplete!(writeCtx);
            }
          : undefined,
      };

      const runner = new BulkJobWorker(
        {
          dataSource: AppDataSource,
          s3Client: getS3Client(),
          s3Bucket: config.media.s3Bucket,
          publisher: deps.publisher,
          enqueueFollowUp: async (t: FollowUpTask) => {
            if (t.queue === "bulk-import-image-fetch") {
              await getBulkImageFetchQueue().add("fetch", t.payload);
            }
            // search-reindex / product-cache-invalidate wired by service-specific consumers
          },
        },
        finalJobType,
      );

      await runner.run(jobId);
      return { ok: true };
    },
    {
      connection: { url: config.bullmq.redisUrl },
      concurrency: 4,
      lockDuration: 30 * 60 * 1000,
    },
  );

  worker.on("error", (e) => console.error("[bulk-dispatcher-worker] error", e));
  return worker;
}
