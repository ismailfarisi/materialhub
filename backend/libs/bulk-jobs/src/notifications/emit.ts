import type { BulkImportJob } from "@materialhub/database";

export interface BulkJobCompletedPayload {
  jobId: string;
  jobType: string;
  status: string;
  vendorId: string | null;
  initiatedByUserId: string;
  totalRows: number | null;
  succeededRows: number;
  skippedRows: number;
  imagesTotal: number;
  imagesFailed: number;
}

export type BulkJobEventPublisher = (
  eventType: "bulk_job_completed" | "bulk_job_images_completed",
  payload: BulkJobCompletedPayload,
) => Promise<void>;

export function buildCompletedPayload(job: BulkImportJob): BulkJobCompletedPayload {
  return {
    jobId: job.id,
    jobType: job.job_type,
    status: job.status,
    vendorId: job.vendor_id,
    initiatedByUserId: job.initiated_by_user_id,
    totalRows: job.total_rows,
    succeededRows: job.succeeded_rows,
    skippedRows: job.skipped_rows,
    imagesTotal: job.images_total,
    imagesFailed: job.images_failed,
  };
}
