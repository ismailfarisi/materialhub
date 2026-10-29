import {
  BulkImportJob,
  BulkImportMode,
  type BulkJobFileFormat,
  BulkJobStatus,
  type BulkJobStrictness,
  type BulkJobType,
  type UserRole,
} from "@materialhub/database";
import type { DataSource } from "typeorm";

export interface CreateJobArgs {
  jobType: BulkJobType;
  strictness: BulkJobStrictness;
  importMode?: BulkImportMode;
  vendorId: string | null;
  initiatedByUserId: string;
  initiatedByRole: UserRole;
  fileS3Key: string;
  fileName: string;
  fileSizeBytes: number;
  fileFormat: BulkJobFileFormat;
}

export class JobRepository {
  constructor(private readonly dataSource: DataSource) {}

  private repo() {
    return this.dataSource.getRepository(BulkImportJob);
  }

  async create(args: CreateJobArgs): Promise<BulkImportJob> {
    const job = this.repo().create({
      job_type: args.jobType,
      strictness: args.strictness,
      import_mode: args.importMode ?? BulkImportMode.Upsert,
      status: BulkJobStatus.PendingUpload,
      vendor_id: args.vendorId,
      initiated_by_user_id: args.initiatedByUserId,
      initiated_by_role: args.initiatedByRole,
      file_s3_key: args.fileS3Key,
      file_name: args.fileName,
      file_size_bytes: args.fileSizeBytes,
      file_format: args.fileFormat,
    });
    return this.repo().save(job);
  }

  async findById(id: string): Promise<BulkImportJob | null> {
    return this.repo().findOne({ where: { id } });
  }

  async markQueued(id: string): Promise<void> {
    await this.repo().update(id, { status: BulkJobStatus.Queued, queued_at: new Date() });
  }

  async markRunning(id: string): Promise<void> {
    await this.repo().update(id, { status: BulkJobStatus.Running, started_at: new Date() });
  }

  async markCompleted(id: string, hadErrors: boolean): Promise<void> {
    await this.repo().update(id, {
      status: hadErrors ? BulkJobStatus.CompletedWithErrors : BulkJobStatus.Completed,
      completed_at: new Date(),
    });
  }

  async markFailed(id: string, errorReportS3Key: string | null): Promise<void> {
    await this.repo().update(id, {
      status: BulkJobStatus.Failed,
      completed_at: new Date(),
      error_report_s3_key: errorReportS3Key,
    });
  }

  async markCancelled(id: string): Promise<void> {
    await this.repo().update(id, { status: BulkJobStatus.Cancelled, completed_at: new Date() });
  }

  async requestCancel(id: string): Promise<void> {
    await this.repo().update(id, { cancel_requested_at: new Date() });
  }

  async setTotalRows(id: string, total: number): Promise<void> {
    await this.repo().update(id, { total_rows: total });
  }

  async incrementCounters(
    id: string,
    delta: { processed?: number; succeeded?: number; skipped?: number },
  ): Promise<void> {
    const set: string[] = [];
    const params: unknown[] = [id];
    let idx = 2;
    if (delta.processed != null) {
      set.push(`processed_rows = processed_rows + $${idx++}`);
      params.push(delta.processed);
    }
    if (delta.succeeded != null) {
      set.push(`succeeded_rows = succeeded_rows + $${idx++}`);
      params.push(delta.succeeded);
    }
    if (delta.skipped != null) {
      set.push(`skipped_rows = skipped_rows + $${idx++}`);
      params.push(delta.skipped);
    }
    if (set.length === 0) return;
    await this.dataSource.query(
      `UPDATE bulk_import_jobs SET ${set.join(", ")} WHERE id = $1`,
      params,
    );
  }

  async setErrorReportKey(id: string, key: string): Promise<void> {
    await this.repo().update(id, { error_report_s3_key: key });
  }

  async setImagesTotal(id: string, total: number): Promise<void> {
    await this.repo().update(id, { images_total: total });
  }

  async incrementImageCounters(
    id: string,
    delta: { processed?: number; failed?: number },
  ): Promise<void> {
    const set: string[] = [];
    const params: unknown[] = [id];
    let idx = 2;
    if (delta.processed != null) {
      set.push(`images_processed = images_processed + $${idx++}`);
      params.push(delta.processed);
    }
    if (delta.failed != null) {
      set.push(`images_failed = images_failed + $${idx++}`);
      params.push(delta.failed);
    }
    if (set.length === 0) return;
    await this.dataSource.query(
      `UPDATE bulk_import_jobs SET ${set.join(", ")} WHERE id = $1`,
      params,
    );
  }

  async isCancelRequested(id: string): Promise<boolean> {
    const row = await this.repo()
      .createQueryBuilder("j")
      .select("j.cancel_requested_at", "cancel_requested_at")
      .where("j.id = :id", { id })
      .getRawOne<{ cancel_requested_at: Date | null }>();
    return row?.cancel_requested_at != null;
  }
}
