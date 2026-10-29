import { GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "@materialhub/config";
import {
  BulkExportFileFormat,
  BulkExportJobStatus,
  ProductExportPreset,
  UserRole,
} from "@materialhub/database";
import type { Queue } from "bullmq";
import type { DataSource } from "typeorm";
import {
  getProductExportFieldsByKey,
  getProductExportMetadata,
  resolveProductExportFields,
  validateProductExportRequest,
} from "./product-export.fields.ts";
import { ProductExportQuery } from "./product-export.query.ts";
import { ProductExportRepository } from "./product-export.repository.ts";
import {
  serializeProductExportCsv,
  serializeProductExportXlsx,
} from "./product-export.serializer.ts";
import type {
  ExportCallerRole,
  ProductExportCreateRequest,
  ProductExportFilters,
  ProductExportJobSummary,
} from "./product-export.types.ts";

const RETENTION_DAYS = 7;
const MAX_ROWS = 50_000;

export interface ProductExportCaller {
  userId: string;
  role: ExportCallerRole;
  vendorIds: string[];
}

function forbidden(message: string, code: string): Error & { statusCode: number; code: string } {
  return Object.assign(new Error(message), { statusCode: 403, code });
}

function badRequest(message: string, code: string): Error & { statusCode: number; code: string } {
  return Object.assign(new Error(message), { statusCode: 400, code });
}

export function resolveProductExportScope(args: {
  caller: ProductExportCaller;
  filters: ProductExportFilters;
}): { admin: boolean; vendorId: string | null } {
  const admin = args.caller.role === UserRole.admin || args.caller.role === UserRole.super_admin;
  let vendorId = args.filters.vendorId ?? null;

  if (!admin) {
    const ownVendorId = args.caller.vendorIds[0];
    if (!ownVendorId) {
      throw forbidden("Vendor scope required", "EXPORT_VENDOR_SCOPE_REQUIRED");
    }
    if (vendorId && vendorId !== ownVendorId) {
      throw forbidden("Cannot export another vendor", "EXPORT_VENDOR_FORBIDDEN");
    }
    vendorId = ownVendorId;
  }

  return { admin, vendorId };
}

function toDbRole(role: ExportCallerRole): UserRole {
  if (role === "vendor") return UserRole.customer;
  return role as UserRole;
}

function contentTypeFor(format: BulkExportFileFormat): string {
  return format === BulkExportFileFormat.Csv
    ? "text/csv; charset=utf-8"
    : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

function toSummary(job: {
  id: string;
  job_type: string;
  status: BulkExportJobStatus;
  vendor_id: string | null;
  format: BulkExportFileFormat;
  preset: ProductExportPreset;
  file_name: string;
  file_size_bytes: number | null;
  row_counts: Record<string, number> | null;
  error_message: string | null;
  expires_at: Date;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
}): ProductExportJobSummary {
  return {
    id: job.id,
    jobType: job.job_type,
    status: job.status,
    vendorId: job.vendor_id,
    format: job.format,
    preset: job.preset,
    fileName: job.file_name,
    fileSizeBytes: job.file_size_bytes,
    rowCounts: job.row_counts,
    errorMessage: job.error_message,
    expiresAt: job.expires_at.toISOString(),
    createdAt: job.created_at.toISOString(),
    startedAt: job.started_at?.toISOString() ?? null,
    completedAt: job.completed_at?.toISOString() ?? null,
  };
}

export class ProductExportService {
  private readonly repo: ProductExportRepository;
  private readonly query: ProductExportQuery;

  constructor(
    private readonly dataSource: DataSource,
    private readonly s3Client: S3Client,
    private readonly queue: Queue,
  ) {
    this.repo = new ProductExportRepository(dataSource);
    this.query = new ProductExportQuery(dataSource);
  }

  getMetadata(role: ExportCallerRole) {
    return getProductExportMetadata(role);
  }

  async createProductExport(args: {
    caller: ProductExportCaller;
    request: ProductExportCreateRequest;
  }): Promise<ProductExportJobSummary> {
    const validation = validateProductExportRequest(args.request);
    if (validation) throw badRequest(validation.message, validation.code);

    const filters = args.request.filters ?? {};
    const scope = resolveProductExportScope({ caller: args.caller, filters });
    const resolved = resolveProductExportFields({
      preset: args.request.preset,
      fieldGroups: args.request.fieldGroups,
      fields: args.request.fields ?? [],
    });
    const format = args.request.format as BulkExportFileFormat;
    const extension = format === BulkExportFileFormat.Csv ? "csv" : "xlsx";
    const fileName = `product-export-${new Date().toISOString().slice(0, 10)}.${extension}`;

    const job = await this.repo.create({
      vendorId: scope.vendorId,
      initiatedByUserId: args.caller.userId,
      initiatedByRole: toDbRole(args.caller.role),
      format,
      preset: args.request.preset ?? ProductExportPreset.Custom,
      fieldGroups: resolved.fieldGroups,
      fields: resolved.fields,
      filters: { ...filters, vendorId: scope.vendorId },
      fileName,
      expiresAt: new Date(Date.now() + RETENTION_DAYS * 86_400_000),
    });

    await this.queue.add(
      "run",
      { jobId: job.id },
      { jobId: job.id, removeOnComplete: 1000, removeOnFail: 1000 },
    );
    return toSummary(job);
  }

  async listExports(args: {
    admin: boolean;
    vendorId: string | null;
    requestedVendorId?: string;
    page: number;
    pageSize: number;
  }) {
    const result = await this.repo.list(args);
    return {
      items: result.items.map(toSummary),
      total: result.total,
      page: args.page,
      pageSize: args.pageSize,
    };
  }

  async getExport(id: string, access: { admin: boolean; vendorId: string | null }) {
    const job = await this.repo.findById(id);
    if (!job) return null;
    if (!access.admin && job.vendor_id !== access.vendorId) {
      throw forbidden("Export not available", "EXPORT_FORBIDDEN");
    }
    return toSummary(job);
  }

  async getDownloadUrl(id: string, access: { admin: boolean; vendorId: string | null }) {
    const job = await this.repo.findById(id);
    if (!job) return null;
    if (!access.admin && job.vendor_id !== access.vendorId) {
      throw forbidden("Export not available", "EXPORT_FORBIDDEN");
    }
    if (job.status !== BulkExportJobStatus.Completed || !job.file_s3_key) return null;
    if (job.expires_at.getTime() < Date.now()) {
      throw badRequest("Export file expired", "EXPORT_EXPIRED");
    }

    return getSignedUrl(
      this.s3Client,
      new GetObjectCommand({ Bucket: config.media.s3Bucket, Key: job.file_s3_key }),
      { expiresIn: 600 },
    );
  }

  async runExport(jobId: string): Promise<void> {
    const job = await this.repo.findById(jobId);
    if (!job) throw new Error(`export job ${jobId} missing`);

    await this.repo.markRunning(jobId);
    try {
      const resolved = resolveProductExportFields({
        preset: job.preset,
        fieldGroups: job.field_groups,
        fields: job.fields,
      });
      const fields = getProductExportFieldsByKey(job.fields);
      const rows = await this.query.loadRows({
        vendorId: job.vendor_id,
        admin: job.vendor_id === null,
        filters: job.filters as ProductExportFilters,
        fields: job.fields,
        sheets: resolved.sheets,
        maxRows: MAX_ROWS,
      });
      const body =
        job.format === BulkExportFileFormat.Csv
          ? Buffer.from(serializeProductExportCsv({ fields, rows }), "utf8")
          : await serializeProductExportXlsx({ fields, sheets: resolved.sheets, rows });
      const key = `bulk-exports/${job.vendor_id ?? "cross-vendor"}/${job.id}/${job.file_name}`;

      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: config.media.s3Bucket,
          Key: key,
          Body: body,
          ContentType: contentTypeFor(job.format),
        }),
      );
      await this.repo.markCompleted(job.id, {
        fileS3Key: key,
        fileSizeBytes: body.length,
        rowCounts: {
          products: rows.length,
          variants: rows.reduce((count, row) => count + (row.variants?.length ?? 0), 0),
          inventory: rows.reduce((count, row) => count + (row.inventory?.length ?? 0), 0),
          media: rows.reduce((count, row) => count + (row.media?.length ?? 0), 0),
          attributes: rows.reduce((count, row) => count + (row.attributes?.length ?? 0), 0),
        },
      });
    } catch (error) {
      await this.repo.markFailed(job.id, error);
      throw error;
    }
  }
}
