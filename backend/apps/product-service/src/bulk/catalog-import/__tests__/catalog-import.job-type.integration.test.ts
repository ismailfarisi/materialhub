import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { registerTemplate } from "@materialhub/bulk-jobs";
import { config } from "@materialhub/config";
import {
  AppDataSource,
  BulkImportJob,
  BulkJobFileFormat,
  BulkJobStatus,
  BulkJobType,
  Product,
  UserRole,
} from "@materialhub/database";
import { getS3Client } from "@materialhub/utils";
import { Queue } from "bullmq";
import { startBulkDispatcherWorker } from "../../bulk-dispatcher.worker.ts";
import { BulkService } from "../../bulk.service.ts";
import { inventoryUpdateJobType } from "../../inventory-update/inventory-update.job-type.ts";
import { inventoryUpdateTemplate } from "../../inventory-update/inventory-update.template.ts";
import { registerJobType } from "../../job-type-registry.ts";
import { catalogImportJobType } from "../catalog-import.job-type.ts";
import { catalogImportTemplate } from "../catalog-import.template.ts";

const hasDb = !!process.env.DATABASE_URL;
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb("catalog-import — integration", () => {
  let parentQueue: Queue;
  let dispatcher: Awaited<ReturnType<typeof startBulkDispatcherWorker>>;
  let service: BulkService;
  let userId: string;
  let vendorId: string;
  let categorySlug: string;
  let warehouseId: string;

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    registerJobType(inventoryUpdateJobType as never);
    registerTemplate(inventoryUpdateTemplate);
    registerJobType(catalogImportJobType as never);
    registerTemplate(catalogImportTemplate);

    parentQueue = new Queue("bulk-import-parent", {
      connection: { url: config.bullmq.redisUrl } as never,
    });
    service = new BulkService(AppDataSource, getS3Client(), parentQueue);
    dispatcher = await startBulkDispatcherWorker({ publisher: (async () => {}) as never });

    const u = await AppDataSource.query(
      // Phase 3a: vendor owners use role='customer'; access via vendor_members
      `INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES ($1,'x','A','B','customer') RETURNING id`,
      [`cat-${Date.now()}@ex.com`],
    );
    userId = u[0].id;
    const v = await AppDataSource.query(
      `INSERT INTO vendors (user_id, business_name, contact_email, status) VALUES ($1,'Cat Co','c@ex.com','approved') RETURNING id`,
      [userId],
    );
    vendorId = v[0].id;
    const wh = await AppDataSource.query(
      `INSERT INTO warehouses (vendor_id, name, code, address_line_1, city, emirate, country_code, is_default, is_active) VALUES ($1,'M','WH-CAT','x','Dubai','Dubai','AE',true,true) RETURNING id`,
      [vendorId],
    );
    warehouseId = wh[0].id;
    const cat = await AppDataSource.query("SELECT slug FROM categories LIMIT 1");
    categorySlug = cat[0].slug;
  });

  afterAll(async () => {
    await AppDataSource.query("DELETE FROM inventory WHERE warehouse_id = $1", [warehouseId]);
    await AppDataSource.query("DELETE FROM products WHERE vendor_id = $1", [vendorId]);
    await AppDataSource.query("DELETE FROM bulk_import_jobs WHERE vendor_id = $1", [vendorId]);
    await AppDataSource.query("DELETE FROM warehouses WHERE id = $1", [warehouseId]);
    await AppDataSource.query("DELETE FROM vendors WHERE id = $1", [vendorId]);
    await AppDataSource.query("DELETE FROM users WHERE id = $1", [userId]);
    await dispatcher.close();
    await parentQueue.close();
  });

  test("imports 2 simple products", async () => {
    const csv = [
      "external_id,name,category_slug,price,initial_quantity",
      `P-A,Alpha Kraft Sheet,${categorySlug},9900,50`,
      `P-B,Beta Hoodie,${categorySlug},19900,25`,
    ].join("\n");

    const { jobId } = await service.initiate({
      jobType: BulkJobType.CatalogImport,
      fileName: "valid.csv",
      fileSizeBytes: csv.length,
      fileFormat: BulkJobFileFormat.Csv,
      vendorId,
      initiatedByUserId: userId,
      initiatedByRole: UserRole.customer, // Phase 3a: vendor owners have role=customer
    });

    const created = await AppDataSource.getRepository(BulkImportJob).findOne({
      where: { id: jobId },
    });
    if (!created) throw new Error("job row missing after initiate");

    await getS3Client().send(
      new PutObjectCommand({
        Bucket: config.media.s3Bucket,
        Key: created.file_s3_key,
        Body: csv,
      }),
    );

    await service.start(jobId);

    const deadline = Date.now() + 30_000;
    let job: BulkImportJob | null = null;
    while (Date.now() < deadline) {
      job = await AppDataSource.getRepository(BulkImportJob).findOne({ where: { id: jobId } });
      if (
        job &&
        [
          BulkJobStatus.Completed,
          BulkJobStatus.CompletedWithErrors,
          BulkJobStatus.Failed,
          BulkJobStatus.Cancelled,
        ].includes(job.status)
      ) {
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!job) throw new Error("job not found");
    expect(job.status).toBe(BulkJobStatus.Completed);

    const rows = await AppDataSource.getRepository(Product).find({
      where: { vendor_id: vendorId },
    });
    expect(rows.map((r) => r.external_id).sort()).toEqual(["P-A", "P-B"]);
  });

  test("expands Drive folder URL in image_urls into per-file image tasks", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("googleapis.com/drive/v3/files")) {
        return new Response(
          JSON.stringify({
            files: [
              { id: "drive-file-B", name: "02-back.jpg" },
              { id: "drive-file-A", name: "01-front.jpg" },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return originalFetch(input as string | URL | Request, init);
    }) as typeof fetch;

    try {
      const csv = [
        "external_id,name,category_slug,price,image_urls",
        `P-DRIVE,Drive Folder Kraft Sheet,${categorySlug},9900,https://drive.google.com/drive/folders/TEST_FOLDER_ID`,
      ].join("\n");

      const { jobId } = await service.initiate({
        jobType: BulkJobType.CatalogImport,
        fileName: "drive.csv",
        fileSizeBytes: csv.length,
        fileFormat: BulkJobFileFormat.Csv,
        vendorId,
        initiatedByUserId: userId,
        initiatedByRole: UserRole.customer,
      });

      const created = await AppDataSource.getRepository(BulkImportJob).findOne({
        where: { id: jobId },
      });
      if (!created) throw new Error("job row missing after initiate");

      await getS3Client().send(
        new PutObjectCommand({
          Bucket: config.media.s3Bucket,
          Key: created.file_s3_key,
          Body: csv,
        }),
      );

      const prevKey = (config as { google: { driveApiKey: string | null } }).google.driveApiKey;
      (config as { google: { driveApiKey: string | null } }).google.driveApiKey = "test-key";

      try {
        await service.start(jobId);

        const deadline = Date.now() + 30_000;
        let job: BulkImportJob | null = null;
        while (Date.now() < deadline) {
          job = await AppDataSource.getRepository(BulkImportJob).findOne({ where: { id: jobId } });
          if (
            job &&
            [
              BulkJobStatus.Completed,
              BulkJobStatus.CompletedWithErrors,
              BulkJobStatus.Failed,
              BulkJobStatus.Cancelled,
            ].includes(job.status)
          ) {
            break;
          }
          await new Promise((r) => setTimeout(r, 250));
        }
        if (!job) throw new Error("job not found");
        expect(job.status).toBe(BulkJobStatus.Completed);

        const tasks = await AppDataSource.query(
          `SELECT source_url, sort_order
             FROM bulk_import_job_image_tasks
            WHERE job_id = $1
            ORDER BY sort_order ASC`,
          [jobId],
        );
        expect(tasks).toHaveLength(2);
        expect(tasks[0].source_url).toBe("https://lh3.googleusercontent.com/d/drive-file-A=w2000");
        expect(tasks[0].sort_order).toBe(0);
        expect(tasks[1].source_url).toBe("https://lh3.googleusercontent.com/d/drive-file-B=w2000");
        expect(tasks[1].sort_order).toBe(1);
      } finally {
        (config as { google: { driveApiKey: string | null } }).google.driveApiKey = prevKey;
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
