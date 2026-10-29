import { GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  ChangesRepository,
  ErrorsRepository,
  JobRepository,
  generateCsvTemplate,
  generateXlsxTemplate,
  getTemplate,
} from "@materialhub/bulk-jobs";
import { config } from "@materialhub/config";
import {
  AttributeValue,
  BulkImportJob,
  BulkImportMode,
  BulkJobFileFormat,
  BulkJobStatus,
  BulkJobStrictness,
  BulkJobType,
  Category,
  CategoryAttribute,
  type UserRole as DbUserRole,
} from "@materialhub/database";
import type { UserRole } from "@materialhub/guards";
import type { Queue } from "bullmq";
import type { DataSource } from "typeorm";
import { scheduleIndexUpdatesBulk } from "../domain/flash-deal/effects.ts";
import {
  buildCatalogImportTemplateForCategories,
  buildCatalogTemplateCategoriesFromRows,
} from "./catalog-import/catalog-import.template.ts";
import { isJobTypeImplemented } from "./job-type-registry.ts";

export interface InitiateArgs {
  jobType: BulkJobType;
  fileName: string;
  fileSizeBytes: number;
  fileFormat: BulkJobFileFormat;
  mode?: BulkImportMode;
  vendorId: string | null;
  initiatedByUserId: string;
  initiatedByRole: UserRole;
}

export interface InitiateResult {
  jobId: string;
  presignedUrl: string;
  s3Key: string;
  expiresAt: string;
}

function contentTypeFor(format: BulkJobFileFormat): string {
  return format === BulkJobFileFormat.Csv
    ? "text/csv"
    : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function parseCategorySlugs(categorySlugs?: string | null): string[] {
  return [
    ...new Set(
      (categorySlugs ?? "")
        .split(",")
        .map((slug) => slug.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

export class BulkService {
  private readonly jobRepo: JobRepository;
  private readonly errorsRepo: ErrorsRepository;
  private readonly changesRepo: ChangesRepository;

  constructor(
    private readonly dataSource: DataSource,
    private readonly s3Client: S3Client,
    private readonly parentQueue: Queue,
  ) {
    this.jobRepo = new JobRepository(dataSource);
    this.errorsRepo = new ErrorsRepository(dataSource);
    this.changesRepo = new ChangesRepository(dataSource);
  }

  async initiate(args: InitiateArgs): Promise<InitiateResult> {
    const defaultStrictness =
      args.jobType === BulkJobType.InventoryUpdate
        ? BulkJobStrictness.AllOrNothing
        : BulkJobStrictness.BestEffort;

    // Create job row first to reserve an ID
    const job = await this.jobRepo.create({
      jobType: args.jobType,
      strictness: defaultStrictness,
      importMode: args.mode ?? BulkImportMode.Upsert,
      vendorId: args.vendorId,
      initiatedByUserId: args.initiatedByUserId,
      initiatedByRole: args.initiatedByRole as unknown as DbUserRole,
      fileS3Key: "",
      fileName: args.fileName,
      fileSizeBytes: args.fileSizeBytes,
      fileFormat: args.fileFormat,
    });

    const scopePart = args.vendorId ?? "cross-vendor";
    const key = `bulk-uploads/${scopePart}/${job.id}/${sanitize(args.fileName)}`;
    const contentType = contentTypeFor(args.fileFormat);

    const cmd = new PutObjectCommand({
      Bucket: config.media.s3Bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: args.fileSizeBytes,
    });
    const uploadUrl = await getSignedUrl(this.s3Client, cmd, {
      expiresIn: 600,
      signableHeaders: new Set(["content-type", "content-length"]),
    });
    const expiresAt = new Date(Date.now() + 600 * 1000);

    await this.dataSource.getRepository(BulkImportJob).update(job.id, { file_s3_key: key });

    return {
      jobId: job.id,
      presignedUrl: uploadUrl,
      s3Key: key,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async start(jobId: string): Promise<void> {
    const job = await this.jobRepo.findById(jobId);
    if (!job) throw Object.assign(new Error("not_found"), { statusCode: 404 });
    if (job.status !== BulkJobStatus.PendingUpload) {
      throw Object.assign(new Error(`bad_status:${job.status}`), {
        statusCode: 400,
      });
    }
    if (!isJobTypeImplemented(job.job_type)) {
      throw Object.assign(new Error("not_implemented"), { statusCode: 501 });
    }

    // Enforce one-active-per-vendor-per-jobType
    const conflict = await this.dataSource
      .getRepository(BulkImportJob)
      .createQueryBuilder("j")
      .where("j.vendor_id IS NOT DISTINCT FROM :vid", { vid: job.vendor_id })
      .andWhere("j.job_type = :jt", { jt: job.job_type })
      .andWhere("j.status IN ('queued','running')")
      .andWhere("j.id != :id", { id: job.id })
      .getCount();
    if (conflict > 0) {
      throw Object.assign(new Error("concurrent_job_exists"), {
        statusCode: 409,
      });
    }

    await this.jobRepo.markQueued(jobId);
    await this.parentQueue.add(
      "run",
      { jobId },
      { jobId, removeOnComplete: 1000, removeOnFail: 1000 },
    );
  }

  async cancel(jobId: string): Promise<void> {
    const job = await this.jobRepo.findById(jobId);
    if (!job) throw Object.assign(new Error("not_found"), { statusCode: 404 });
    await this.jobRepo.requestCancel(jobId);
  }

  async revert(
    jobId: string,
    callerUserId: string,
  ): Promise<{ revertedCount: number; skippedAlreadyDeletedCount: number }> {
    const job = await this.jobRepo.findById(jobId);
    if (!job) throw Object.assign(new Error("not_found"), { statusCode: 404 });
    if (job.job_type !== BulkJobType.FlashDealImport) {
      throw Object.assign(new Error("unsupported_job_type"), {
        statusCode: 400,
      });
    }
    if (
      job.status !== BulkJobStatus.Completed &&
      job.status !== BulkJobStatus.CompletedWithErrors
    ) {
      throw Object.assign(new Error("not_in_terminal_state"), {
        statusCode: 400,
      });
    }
    if (job.reverted_at !== null) {
      throw Object.assign(new Error("already_reverted"), { statusCode: 409 });
    }

    return this.dataSource.transaction(async (manager) => {
      const created = await manager.query(
        `SELECT entity_id, new_value FROM bulk_import_job_row_changes
         WHERE job_id = $1 AND entity_type = 'flash_deal' AND field = '_created'`,
        [jobId],
      );
      if (created.length === 0) {
        await manager.query(
          "UPDATE bulk_import_jobs SET reverted_at = now(), reverted_by_user_id = $2 WHERE id = $1",
          [jobId, callerUserId],
        );
        return { revertedCount: 0, skippedAlreadyDeletedCount: 0 };
      }
      const ids = created.map((r: { entity_id: string }) => r.entity_id);
      // TypeORM 0.3.28's manager.query() returns `[rows, rowCount]` for UPDATE/DELETE
      // (SELECT/INSERT return a flat rows array). Destructure the rows array.
      const [deleted] = (await manager.query(
        `UPDATE flash_deals SET deleted_at = now(), updated_at = now()
         WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL
         RETURNING id, product_id`,
        [ids],
      )) as [Array<{ id: string; product_id: string }>, number];
      const deletedIdSet = new Set(deleted.map((r: { id: string }) => r.id));

      for (const r of created) {
        if (!deletedIdSet.has(r.entity_id)) continue;
        await manager.query(
          `INSERT INTO bulk_import_job_row_changes
            (job_id, row_number, entity_type, entity_id, field, old_value, new_value)
           VALUES ($1, $2, 'flash_deal', $3, '_reverted', $4::jsonb, NULL)`,
          [jobId, 0, r.entity_id, JSON.stringify(r.new_value)],
        );
      }
      await manager.query(
        "UPDATE bulk_import_jobs SET reverted_at = now(), reverted_by_user_id = $2 WHERE id = $1",
        [jobId, callerUserId],
      );

      const productIds = Array.from(
        new Set(deleted.map((r: { product_id: string }) => r.product_id)),
      ) as string[];
      await scheduleIndexUpdatesBulk(productIds.map((productId) => ({ productId, deals: [] })));

      return {
        revertedCount: deleted.length,
        skippedAlreadyDeletedCount: ids.length - deleted.length,
      };
    });
  }

  async getById(jobId: string): Promise<BulkImportJob | null> {
    return this.jobRepo.findById(jobId);
  }

  async list(args: {
    callerRole: UserRole;
    callerVendorIdForScoping: string | null;
    filters: {
      jobType?: BulkJobType;
      status?: BulkJobStatus;
      vendorId?: string;
    };
    page: number;
    pageSize: number;
  }): Promise<{
    items: BulkImportJob[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const qb = this.dataSource
      .getRepository(BulkImportJob)
      .createQueryBuilder("j")
      .orderBy("j.created_at", "DESC")
      .take(args.pageSize)
      .skip((args.page - 1) * args.pageSize);

    if (args.callerVendorIdForScoping) {
      qb.andWhere("j.vendor_id = :vid", { vid: args.callerVendorIdForScoping });
    } else if (args.filters.vendorId) {
      qb.andWhere("j.vendor_id = :vid", { vid: args.filters.vendorId });
    }
    if (args.filters.jobType) qb.andWhere("j.job_type = :jt", { jt: args.filters.jobType });
    if (args.filters.status) qb.andWhere("j.status = :st", { st: args.filters.status });

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page: args.page, pageSize: args.pageSize };
  }

  async getErrorReportPresignedUrl(jobId: string): Promise<string | null> {
    const job = await this.jobRepo.findById(jobId);
    if (!job?.error_report_s3_key) return null;
    const cmd = new GetObjectCommand({
      Bucket: config.media.s3Bucket,
      Key: job.error_report_s3_key,
    });
    return getSignedUrl(this.s3Client, cmd, { expiresIn: 600 });
  }

  async getChanges(jobId: string, page: number, pageSize: number) {
    return this.changesRepo.listByJob(jobId, pageSize, (page - 1) * pageSize);
  }

  async listImageTasks(jobId: string, status?: string) {
    const rows = status
      ? await this.dataSource.query(
          `SELECT id, source_url AS "sourceUrl", last_error AS "lastError", row_number AS "rowNumber", status
         FROM bulk_import_job_image_tasks
         WHERE job_id = $1 AND status = $2
         ORDER BY row_number, sort_order`,
          [jobId, status],
        )
      : await this.dataSource.query(
          `SELECT id, source_url AS "sourceUrl", last_error AS "lastError", row_number AS "rowNumber", status
         FROM bulk_import_job_image_tasks
         WHERE job_id = $1
         ORDER BY row_number, sort_order`,
          [jobId],
        );
    return rows as Array<{
      id: string;
      sourceUrl: string;
      lastError: string | null;
      rowNumber: number;
      status: string;
    }>;
  }

  async retryFailedImages(
    jobId: string,
    imageFetchQueue: { add: (name: string, data: unknown) => Promise<unknown> },
  ): Promise<number> {
    const rows: Array<{
      id: string;
      row_number: number;
      product_id: string;
      variant_id: string | null;
      source_url: string;
      sort_order: number;
    }> = await this.dataSource.query(
      `SELECT id, row_number, product_id, variant_id, source_url, sort_order
     FROM bulk_import_job_image_tasks
     WHERE job_id = $1 AND status = 'failed'`,
      [jobId],
    );
    if (rows.length === 0) return 0;
    await this.dataSource.query(
      `UPDATE bulk_import_job_image_tasks SET status = 'queued', attempt_count = 0, last_error = NULL WHERE job_id = $1 AND status = 'failed'`,
      [jobId],
    );
    await this.dataSource.query(
      "UPDATE bulk_import_jobs SET images_failed = GREATEST(images_failed - $2, 0) WHERE id = $1",
      [jobId, rows.length],
    );
    for (const r of rows) {
      await imageFetchQueue.add("fetch", {
        taskRecord: {
          jobId,
          rowNumber: r.row_number,
          productId: r.product_id,
          variantId: r.variant_id,
          sourceUrl: r.source_url,
          sortOrder: r.sort_order,
        },
      });
    }
    return rows.length;
  }

  async getTemplate(
    jobType: BulkJobType,
    format: "csv" | "xlsx",
    options: { categorySlugs?: string | null } = {},
  ): Promise<{ body: Buffer | string; contentType: string; filename: string }> {
    let desc = getTemplate(jobType);
    if (!desc) {
      throw Object.assign(new Error("template_not_registered"), {
        statusCode: 501,
      });
    }
    const categorySlugs = parseCategorySlugs(options.categorySlugs);
    if (jobType === BulkJobType.CatalogImport && categorySlugs.length > 0) {
      desc = await this.buildCatalogImportTemplate(categorySlugs);
    }
    if (format === "csv") {
      return {
        body: generateCsvTemplate(desc),
        contentType: "text/csv; charset=utf-8",
        filename: `${jobType}-template.csv`,
      };
    }
    const buf = await generateXlsxTemplate(desc);
    return {
      body: buf,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      filename: `${jobType}-template.xlsx`,
    };
  }

  private async buildCatalogImportTemplate(categorySlugs: string[]) {
    const allCategories = await this.dataSource
      .getRepository(Category)
      .createQueryBuilder("category")
      .where("category.deleted_at IS NULL")
      .orderBy("category.sort_order", "ASC")
      .getMany();
    const categories = allCategories.filter((category) =>
      categorySlugs.includes(category.slug.toLowerCase()),
    );

    const foundSlugs = new Set(categories.map((category) => category.slug.toLowerCase()));
    const missingSlugs = categorySlugs.filter((slug) => !foundSlugs.has(slug));
    if (missingSlugs.length > 0) {
      throw Object.assign(new Error(`unknown_category_slug: ${missingSlugs.join(", ")}`), {
        statusCode: 400,
      });
    }

    if (categories.length === 0) return buildCatalogImportTemplateForCategories([]);
    const categoriesById = new Map(allCategories.map((category) => [category.id, category]));
    const applicableCategoryIds = new Set<string>();
    for (const category of categories) {
      let cursor: Category | undefined = category;
      while (cursor) {
        applicableCategoryIds.add(cursor.id);
        cursor = cursor.parent_id ? categoriesById.get(cursor.parent_id) : undefined;
      }
    }

    const categoryAttributes = await this.dataSource
      .getRepository(CategoryAttribute)
      .createQueryBuilder("categoryAttribute")
      .innerJoinAndSelect("categoryAttribute.attribute", "attribute")
      .where("categoryAttribute.category_id IN (:...categoryIds)", {
        categoryIds: [...applicableCategoryIds],
      })
      .andWhere("categoryAttribute.deleted_at IS NULL")
      .andWhere("attribute.deleted_at IS NULL")
      .orderBy("categoryAttribute.sort_order", "ASC")
      .getMany();

    const attributeIds = [
      ...new Set(categoryAttributes.map((categoryAttribute) => categoryAttribute.attribute_id)),
    ];
    const valuesByAttributeId = new Map<string, AttributeValue[]>();
    if (attributeIds.length > 0) {
      const values = await this.dataSource
        .getRepository(AttributeValue)
        .createQueryBuilder("value")
        .where("value.attribute_id IN (:...attributeIds)", { attributeIds })
        .andWhere("value.deleted_at IS NULL")
        .orderBy("value.sort_order", "ASC")
        .addOrderBy("value.slug", "ASC")
        .getMany();
      for (const value of values) {
        const list = valuesByAttributeId.get(value.attribute_id) ?? [];
        list.push(value);
        valuesByAttributeId.set(value.attribute_id, list);
      }
    }

    return buildCatalogImportTemplateForCategories(
      buildCatalogTemplateCategoriesFromRows({
        selectedCategories: categories.map((category) => ({
          id: category.id,
          parentId: category.parent_id,
          categorySlug: category.slug,
          categoryName: category.name,
        })),
        allCategories: allCategories.map((category) => ({
          id: category.id,
          parentId: category.parent_id,
          categorySlug: category.slug,
          categoryName: category.name,
        })),
        categoryAttributes: categoryAttributes.map((categoryAttribute) => ({
          categoryId: categoryAttribute.category_id,
          slug: categoryAttribute.attribute.slug,
          name: categoryAttribute.attribute.name,
          isRequired: categoryAttribute.is_required,
          isVariant: categoryAttribute.attribute.is_variant,
          values: (valuesByAttributeId.get(categoryAttribute.attribute_id) ?? []).map((value) => ({
            slug: value.slug,
            value: value.value,
          })),
        })),
      }),
    );
  }
}
