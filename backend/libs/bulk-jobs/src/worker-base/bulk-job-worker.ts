import type { S3Client } from "@aws-sdk/client-s3";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { type BulkImportJob, BulkJobStatus, BulkJobStrictness } from "@materialhub/database";
import type { DataSource } from "typeorm";
import { type ChangeEntry, ChangesRepository } from "../job-store/changes.repository.ts";
import { ErrorsRepository } from "../job-store/errors.repository.ts";
import { JobRepository } from "../job-store/job.repository.ts";
import { type BulkJobEventPublisher, buildCompletedPayload } from "../notifications/emit.ts";
import { parseFile } from "../parsers/parse-file.ts";
import { BulkErrorCodes } from "../types/error-codes.ts";
import type { JobType } from "../types/job-type.ts";
import type { BatchResult, FollowUpTask, WriteContext } from "../types/write-context.ts";
import { ErrorAccumulator } from "../validators/error-accumulator.ts";
import { validateRowSchema } from "../validators/row-validator.ts";
import { BatchWriter } from "./batch-writer.ts";
import { CancellationChecker } from "./cancellation.ts";
import { effectiveParseOptions } from "./parse-options.ts";

export interface WorkerDeps {
  dataSource: DataSource;
  s3Client: S3Client;
  s3Bucket: string;
  publisher: BulkJobEventPublisher;
  enqueueFollowUp: (task: FollowUpTask) => Promise<void>;
}

const BATCH_SIZE = 500;

export class BulkJobWorker {
  private readonly jobRepo: JobRepository;
  private readonly errorsRepo: ErrorsRepository;
  private readonly changesRepo: ChangesRepository;
  private readonly batchWriter: BatchWriter;

  constructor(
    private readonly deps: WorkerDeps,
    private readonly jobType: JobType<unknown, unknown>,
  ) {
    this.jobRepo = new JobRepository(deps.dataSource);
    this.errorsRepo = new ErrorsRepository(deps.dataSource);
    this.changesRepo = new ChangesRepository(deps.dataSource);
    this.batchWriter = new BatchWriter(deps.dataSource);
  }

  async run(jobId: string): Promise<void> {
    const job = await this.jobRepo.findById(jobId);
    if (!job) throw new Error(`bulk job ${jobId} not found`);
    if (job.status !== BulkJobStatus.Queued) {
      throw new Error(`bulk job ${jobId} in unexpected status ${job.status}`);
    }

    await this.jobRepo.markRunning(jobId);

    try {
      await this.runInternal(job);
    } catch (err) {
      const stack = err instanceof Error ? (err.stack ?? err.message) : String(err);
      console.error(`[bulk-job-worker] job ${jobId} crashed:`, stack);
      // Persist the crash as a row-level error so it surfaces in the report and
      // the UI's error-report download — otherwise the failure is invisible
      // (BullMQ swallows per-job throws, and outer markFailed used to be called
      // with a null error_report_s3_key).
      let reportKey: string | null = null;
      try {
        await this.errorsRepo.insertMany(jobId, [
          {
            rowNumber: 0,
            sheetName: null,
            errorCode: BulkErrorCodes.WORKER_CRASHED,
            errorMessage: stack.slice(0, 4000),
            field: null,
            rowSnapshot: {},
          },
        ]);
        await this.writeErrorReport(jobId);
        reportKey = `bulk-jobs/${jobId}/error-report.csv`;
      } catch (persistErr) {
        console.error(
          `[bulk-job-worker] failed to persist worker_crashed error for ${jobId}:`,
          persistErr,
        );
      }
      await this.jobRepo.markFailed(jobId, reportKey);
      await this.deps.publisher("bulk_job_completed", buildCompletedPayload(job));
      throw err;
    }
  }

  private async runInternal(job: BulkImportJob): Promise<void> {
    // 1. Download file
    const buf = await this.downloadFile(job.file_s3_key);

    // 2. Parse
    const parsed = await parseFile({
      buffer: buf,
      format: job.file_format,
      parseOptions: effectiveParseOptions(this.jobType, job),
    });

    if (parsed.fileLevelErrors.length > 0) {
      await this.errorsRepo.insertMany(job.id, parsed.fileLevelErrors);
      await this.writeErrorReport(job.id);
      await this.jobRepo.markFailed(job.id, `bulk-jobs/${job.id}/error-report.csv`);
      await this.deps.publisher("bulk_job_completed", buildCompletedPayload(job));
      return;
    }

    await this.jobRepo.setTotalRows(job.id, parsed.rows.length);

    // 3. Build validation context
    const ctx = await this.jobType.buildValidationContext({
      dataSource: this.deps.dataSource,
      vendorId: job.vendor_id,
      importMode: job.import_mode,
    });

    // 4. Schema + pre-validate + coerce per row
    const acc = new ErrorAccumulator();
    const validRows: Array<{ parsed: (typeof parsed.rows)[number]; coerced: unknown }> = [];

    for (const row of parsed.rows) {
      if (!validateRowSchema(row, this.jobType.rowSchema, acc)) continue;
      const coerced = this.jobType.coerceRow(row, ctx);
      if (!coerced.ok) {
        acc.pushAll(coerced.errors);
        continue;
      }
      validRows.push({ parsed: row, coerced: coerced.value });
    }

    const preErrors =
      this.jobType.preValidate?.(
        validRows.map((r) => r.parsed),
        ctx,
      ) ?? [];
    acc.pushAll(preErrors);
    const bannedRows = new Set(preErrors.map((e) => e.rowNumber));
    const cleanRows = validRows.filter((r) => !bannedRows.has(r.parsed.rowNumber));

    await this.errorsRepo.insertMany(job.id, [...acc.list()]);

    // 5. Strictness gate
    if (job.strictness === BulkJobStrictness.AllOrNothing && acc.hasAny()) {
      await this.writeErrorReport(job.id);
      await this.jobRepo.markFailed(job.id, `bulk-jobs/${job.id}/error-report.csv`);
      await this.deps.publisher("bulk_job_completed", buildCompletedPayload(job));
      return;
    }

    // 6. Batched writes
    const canceller = new CancellationChecker(() => this.jobRepo.isCancelRequested(job.id));
    const followUps: FollowUpTask[] = [];
    let totalWriteSkipped = 0;

    for (let i = 0; i < cleanRows.length; i += BATCH_SIZE) {
      if (await canceller.isCancelled()) {
        await this.jobRepo.markCancelled(job.id);
        if (acc.hasAny()) await this.writeErrorReport(job.id);
        await this.deps.publisher("bulk_job_completed", buildCompletedPayload(job));
        return;
      }

      const slice = cleanRows.slice(i, i + BATCH_SIZE);
      const pendingChanges: ChangeEntry[] = [];

      const batchResult = await this.batchWriter.run<BatchResult<unknown>>(async (manager) => {
        const writeCtx: WriteContext = {
          job,
          manager,
          batchIndex: Math.floor(i / BATCH_SIZE),
          logChange: (entry) => {
            pendingChanges.push({ jobId: job.id, ...entry });
          },
          pushFollowUp: (task) => {
            followUps.push(task);
          },
        };
        const res = await this.jobType.writeBatch(
          slice.map((r) => r.coerced),
          writeCtx,
        );
        await this.changesRepo.insertMany(pendingChanges, manager);
        return res;
      });

      await this.jobRepo.incrementCounters(job.id, {
        processed: slice.length,
        succeeded: batchResult.succeeded.length,
        skipped: batchResult.skipped.length,
      });

      // Persist per-row skip errors
      totalWriteSkipped += batchResult.skipped.length;
      for (const s of batchResult.skipped) {
        await this.errorsRepo.insertMany(job.id, [
          {
            rowNumber: s.rowNumber,
            sheetName: null,
            errorCode: s.errorCode ?? "write_skipped",
            errorMessage: s.reason,
            field: null,
            rowSnapshot: {},
          },
        ]);
      }
    }

    // 7. postComplete hook
    if (this.jobType.postComplete) {
      await this.batchWriter.run(async (manager) => {
        await this.jobType.postComplete!({
          job,
          manager,
          batchIndex: -1,
          logChange: () => {},
          pushFollowUp: (t) => followUps.push(t),
        });
      });
    }

    // 8. Error report (if any) — include write-time skips, not just pre-validation
    // errors, so the UI's "Fetch error report" button is shown whenever any row
    // failed at any layer.
    const hadAnyError = acc.hasAny() || totalWriteSkipped > 0;
    if (hadAnyError) {
      await this.writeErrorReport(job.id);
    }

    // 9. Final status
    await this.jobRepo.markCompleted(job.id, hadAnyError);

    // 10. Enqueue follow-ups (e.g. image fetches). Set images_total to the
    //     count of bulk-import-image-fetch tasks so the UI reflects the
    //     expected work — image_processed / image_failed are incremented
    //     by the image-fetch worker as it completes each task.
    const imageFetchCount = followUps.filter((t) => t.queue === "bulk-import-image-fetch").length;
    if (imageFetchCount > 0) {
      await this.jobRepo.setImagesTotal(job.id, imageFetchCount);
    }
    for (const t of followUps) {
      await this.deps.enqueueFollowUp(t);
    }

    // 11. Notification — load fresh state so counters reflect completion
    const fresh = await this.jobRepo.findById(job.id);
    if (fresh) {
      await this.deps.publisher("bulk_job_completed", buildCompletedPayload(fresh));
    }
  }

  private async downloadFile(key: string): Promise<Buffer> {
    const cmd = new GetObjectCommand({ Bucket: this.deps.s3Bucket, Key: key });
    const res = await this.deps.s3Client.send(cmd);
    const chunks: Uint8Array[] = [];
    if (!res.Body) throw new Error(`empty body for s3://${this.deps.s3Bucket}/${key}`);
    for await (const c of res.Body as AsyncIterable<Uint8Array>) chunks.push(c);
    return Buffer.concat(chunks);
  }

  private async writeErrorReport(jobId: string): Promise<void> {
    const errors = await this.errorsRepo.listByJob(jobId);
    if (errors.length === 0) return;
    const csv = this.errorsRepo.renderCsv(errors);
    const key = `bulk-jobs/${jobId}/error-report.csv`;
    await this.deps.s3Client.send(
      new PutObjectCommand({
        Bucket: this.deps.s3Bucket,
        Key: key,
        Body: csv,
        ContentType: "text/csv; charset=utf-8",
      }),
    );
    await this.jobRepo.setErrorReportKey(jobId, key);
  }
}
