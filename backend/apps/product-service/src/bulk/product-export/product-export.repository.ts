import {
  type BulkExportFileFormat,
  BulkExportJob,
  BulkExportJobStatus,
  BulkExportJobType,
  type ProductExportPreset,
  type UserRole,
} from "@materialhub/database";
import type { DataSource } from "typeorm";

export class ProductExportRepository {
  constructor(private readonly dataSource: DataSource) {}

  private get repo() {
    return this.dataSource.getRepository(BulkExportJob);
  }

  async create(args: {
    vendorId: string | null;
    initiatedByUserId: string;
    initiatedByRole: UserRole;
    format: BulkExportFileFormat;
    preset: ProductExportPreset;
    fieldGroups: string[];
    fields: string[];
    filters: Record<string, unknown>;
    fileName: string;
    expiresAt: Date;
  }): Promise<BulkExportJob> {
    return this.repo.save(
      this.repo.create({
        job_type: BulkExportJobType.ProductExport,
        status: BulkExportJobStatus.Queued,
        vendor_id: args.vendorId,
        initiated_by_user_id: args.initiatedByUserId,
        initiated_by_role: args.initiatedByRole,
        format: args.format,
        preset: args.preset,
        field_groups: args.fieldGroups,
        fields: args.fields,
        filters: args.filters,
        file_name: args.fileName,
        expires_at: args.expiresAt,
        queued_at: new Date(),
      }),
    );
  }

  findById(id: string): Promise<BulkExportJob | null> {
    return this.repo.findOne({ where: { id } });
  }

  async list(args: {
    vendorId: string | null;
    admin: boolean;
    requestedVendorId?: string;
    page: number;
    pageSize: number;
  }): Promise<{ items: BulkExportJob[]; total: number }> {
    const qb = this.repo
      .createQueryBuilder("job")
      .where("job.deleted_at IS NULL")
      .orderBy("job.created_at", "DESC")
      .take(args.pageSize)
      .skip((args.page - 1) * args.pageSize);

    if (args.admin && args.requestedVendorId) {
      qb.andWhere("job.vendor_id = :vendorId", { vendorId: args.requestedVendorId });
    }
    if (!args.admin) {
      qb.andWhere("job.vendor_id = :vendorId", { vendorId: args.vendorId });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async markRunning(id: string): Promise<void> {
    await this.repo.update(id, {
      status: BulkExportJobStatus.Running,
      started_at: new Date(),
      error_message: null,
    });
  }

  async markCompleted(
    id: string,
    args: { fileS3Key: string; fileSizeBytes: number; rowCounts: Record<string, number> },
  ): Promise<void> {
    await this.repo.update(id, {
      status: BulkExportJobStatus.Completed,
      file_s3_key: args.fileS3Key,
      file_size_bytes: args.fileSizeBytes,
      row_counts: args.rowCounts,
      completed_at: new Date(),
    });
  }

  async markFailed(id: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await this.repo.update(id, {
      status: BulkExportJobStatus.Failed,
      error_message: message.slice(0, 4000),
      completed_at: new Date(),
    });
  }
}
