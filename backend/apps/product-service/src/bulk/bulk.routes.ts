import type { BulkImportJob } from "@materialhub/database";
import { type BulkAccessHelper, bulkJobAccessGuard, jwtAuth } from "@materialhub/guards";
import { auditPlugin } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import type { BulkService } from "./bulk.service.ts";
import {
  ChangesQuery,
  InitiateUploadBody,
  JobIdParam,
  JobListQuery,
  TemplateFormatQuery,
  TemplateJobTypeParam,
} from "./dto/bulk.dto.ts";
import { buildProductExportRoutes } from "./product-export/product-export.routes.ts";
import type { ProductExportService } from "./product-export/product-export.service.ts";

function toJobSummary(job: BulkImportJob) {
  return {
    id: job.id,
    jobType: job.job_type,
    status: job.status,
    vendorId: job.vendor_id,
    fileName: job.file_name,
    totalRows: job.total_rows,
    processedRows: job.processed_rows,
    succeededRows: job.succeeded_rows,
    skippedRows: job.skipped_rows,
    imagesTotal: job.images_total,
    imagesProcessed: job.images_processed,
    imagesFailed: job.images_failed,
    revertedAt: job.reverted_at?.toISOString() ?? null,
    revertedByUserId: job.reverted_by_user_id ?? null,
    createdAt: job.created_at.toISOString(),
    startedAt: job.started_at?.toISOString() ?? null,
    completedAt: job.completed_at?.toISOString() ?? null,
  };
}

/**
 * Returns the 401 unauth body and sets `set.status`.
 * Route handlers must `return unauth(set)` immediately when bulkAccess is null.
 */
function unauth(set: any) {
  set.status = 401;
  return {
    statusCode: 401,
    message: "Authentication required",
    error: "UNAUTHORIZED",
    timestamp: new Date().toISOString(),
  };
}

export function buildBulkRoutes(
  service: BulkService,
  imageFetchQueue: { add: (name: string, data: unknown) => Promise<unknown> },
  productExportService: ProductExportService,
) {
  return (
    new Elysia({ prefix: "/bulk" })
      .use(jwtAuth)
      .use(bulkJobAccessGuard)
      .use(auditPlugin)
      .use(buildProductExportRoutes(productExportService, "/exports"))

      // ─── Initiate upload ────────────────────────────────────────────────
      .post(
        "/uploads/initiate",
        async ({ body, bulkAccess, user, set, audit }: any) => {
          if (!bulkAccess) return unauth(set);
          const access = bulkAccess as BulkAccessHelper;
          const { vendorId } = await access.assertCanCreate({
            targetVendorId: body.targetVendorId ?? null,
          });
          const result = await service.initiate({
            jobType: body.jobType,
            fileName: body.fileName,
            fileSizeBytes: body.fileSizeBytes,
            fileFormat: body.fileFormat,
            mode: body.mode,
            vendorId,
            initiatedByUserId: user!.id,
            initiatedByRole: access.role,
          });
          audit.action = `bulk.${body.jobType}_initiate`;
          audit.entity_type = "bulk_job";
          audit.entity_id = (result as any)?.id;
          audit.metadata = {
            jobType: body.jobType,
            vendorId,
            fileName: body.fileName,
            fileSizeBytes: body.fileSizeBytes,
            mode: body.mode ?? "upsert",
          };
          return result;
        },
        { body: InitiateUploadBody },
      )

      // ─── Start job → queued ─────────────────────────────────────────────
      .post(
        "/jobs/:id/start",
        async ({ params, bulkAccess, set }: any) => {
          if (!bulkAccess) return unauth(set);
          const access = bulkAccess as BulkAccessHelper;
          const job = await service.getById(params.id);
          if (!job) {
            set.status = 404;
            return { error: "not_found" };
          }
          await access.assertCanView(job);
          try {
            await service.start(params.id);
            return { ok: true };
          } catch (err: any) {
            const status = err.statusCode ?? 500;
            set.status = status;
            return { error: err.message };
          }
        },
        { params: JobIdParam },
      )

      // ─── Cancel ─────────────────────────────────────────────────────────
      .post(
        "/jobs/:id/cancel",
        async ({ params, bulkAccess, set }: any) => {
          if (!bulkAccess) return unauth(set);
          const access = bulkAccess as BulkAccessHelper;
          const job = await service.getById(params.id);
          if (!job) {
            set.status = 404;
            return { error: "not_found" };
          }
          await access.assertCanView(job);
          await service.cancel(params.id);
          return { ok: true };
        },
        { params: JobIdParam },
      )

      // ─── List ───────────────────────────────────────────────────────────
      .get(
        "/jobs",
        async (ctx: any) => {
          const { query, set } = ctx;
          const bulkAccess = ctx.bulkAccess ?? null;
          if (!bulkAccess) return unauth(set);
          const access = bulkAccess as BulkAccessHelper;
          const page = query.page ?? 1;
          const pageSize = query.pageSize ?? 20;
          let callerVendorIdForScoping: string | null = null;
          if (
            access.ownVendorIds.length > 0 &&
            access.role !== "admin" &&
            access.role !== "super_admin"
          ) {
            callerVendorIdForScoping = access.ownVendorIds[0] as string;
          }
          const { items, total } = await service.list({
            callerRole: access.role,
            callerVendorIdForScoping,
            filters: {
              jobType: query.jobType,
              status: query.status,
              vendorId: query.vendorId,
            },
            page,
            pageSize,
          });
          return { items: items.map(toJobSummary), total, page, pageSize };
        },
        { query: JobListQuery },
      )

      // ─── Detail ─────────────────────────────────────────────────────────
      .get(
        "/jobs/:id",
        async ({ params, bulkAccess, set }: any) => {
          if (!bulkAccess) return unauth(set);
          const access = bulkAccess as BulkAccessHelper;
          const job = await service.getById(params.id);
          if (!job) {
            set.status = 404;
            return { error: "not_found" };
          }
          await access.assertCanView(job);
          return toJobSummary(job);
        },
        { params: JobIdParam },
      )

      // ─── Error report presigned URL ─────────────────────────────────────
      .get(
        "/jobs/:id/error-report",
        async ({ params, bulkAccess, set }: any) => {
          if (!bulkAccess) return unauth(set);
          const access = bulkAccess as BulkAccessHelper;
          const job = await service.getById(params.id);
          if (!job) {
            set.status = 404;
            return { error: "not_found" };
          }
          await access.assertCanView(job);
          const url = await service.getErrorReportPresignedUrl(params.id);
          if (!url) {
            set.status = 404;
            return { error: "no_report" };
          }
          return { url };
        },
        { params: JobIdParam },
      )

      // ─── Diff log ───────────────────────────────────────────────────────
      .get(
        "/jobs/:id/changes",
        async ({ params, query, bulkAccess, set }: any) => {
          if (!bulkAccess) return unauth(set);
          const access = bulkAccess as BulkAccessHelper;
          const job = await service.getById(params.id);
          if (!job) {
            set.status = 404;
            return { error: "not_found" };
          }
          await access.assertCanView(job);
          const page = query.page ?? 1;
          const pageSize = query.pageSize ?? 50;
          const { items, total } = await service.getChanges(params.id, page, pageSize);
          return {
            items: items.map((c) => ({
              rowNumber: c.row_number,
              entityType: c.entity_type,
              entityId: c.entity_id,
              field: c.field,
              oldValue: c.old_value,
              newValue: c.new_value,
              at: c.created_at.toISOString(),
            })),
            total,
            page,
            pageSize,
          };
        },
        { params: JobIdParam, query: ChangesQuery },
      )

      // ─── List image tasks ───────────────────────────────────────────────
      .get(
        "/jobs/:id/image-tasks",
        async ({ params, query, bulkAccess, set }: any) => {
          if (!bulkAccess) return unauth(set);
          const access = bulkAccess as BulkAccessHelper;
          const job = await service.getById(params.id);
          if (!job) {
            set.status = 404;
            return { error: "not_found" };
          }
          await access.assertCanView(job);
          const items = await service.listImageTasks(
            params.id,
            (query as { status?: string }).status,
          );
          return { items };
        },
        {
          params: JobIdParam,
          query: t.Object({ status: t.Optional(t.String()) }),
        },
      )

      // ─── Retry failed image tasks ───────────────────────────────────────
      .post(
        "/jobs/:id/retry-failed-images",
        async ({ params, bulkAccess, set }: any) => {
          if (!bulkAccess) return unauth(set);
          const access = bulkAccess as BulkAccessHelper;
          const job = await service.getById(params.id);
          if (!job) {
            set.status = 404;
            return { error: "not_found" };
          }
          await access.assertCanView(job);
          const retried = await service.retryFailedImages(params.id, imageFetchQueue);
          return { retried };
        },
        { params: JobIdParam },
      )

      // ─── Template download ──────────────────────────────────────────────
      .get(
        "/templates/:jobType",
        async ({ params, query, set }: any) => {
          try {
            const { body, contentType, filename } = await service.getTemplate(
              params.jobType,
              query.format,
              { categorySlugs: query.categorySlugs },
            );
            set.headers["content-type"] = contentType;
            set.headers["content-disposition"] = `attachment; filename="${filename}"`;
            return body;
          } catch (err: any) {
            const status = err.statusCode ?? 500;
            set.status = status;
            return { error: err.message };
          }
        },
        { params: TemplateJobTypeParam, query: TemplateFormatQuery },
      )
  );
}
