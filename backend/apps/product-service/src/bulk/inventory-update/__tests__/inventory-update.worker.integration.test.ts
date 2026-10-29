import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { registerTemplate } from "@materialhub/bulk-jobs";
import { config } from "@materialhub/config";
import {
  AppDataSource,
  BulkImportJob,
  BulkJobFileFormat,
  BulkJobStatus,
  BulkJobType,
  Inventory,
  UserRole,
} from "@materialhub/database";
import { getS3Client } from "@materialhub/utils";
import { Queue } from "bullmq";
import { startBulkDispatcherWorker } from "../../bulk-dispatcher.worker.ts";
import { BulkService } from "../../bulk.service.ts";
import { registerJobType } from "../../job-type-registry.ts";
import { inventoryUpdateJobType } from "../inventory-update.job-type.ts";
import { inventoryUpdateTemplate } from "../inventory-update.template.ts";

const hasDb = !!process.env.DATABASE_URL;
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb("inventory-update worker — integration", () => {
  let parentQueue: Queue;
  let worker: Awaited<ReturnType<typeof startBulkDispatcherWorker>>;
  let service: BulkService;
  let vendorId: string;
  let userId: string;
  let productAlphaId: string;
  let productBetaId: string;
  let warehouseId: string;

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    registerJobType(inventoryUpdateJobType as never);
    registerTemplate(inventoryUpdateTemplate);

    parentQueue = new Queue("bulk-import-parent", {
      connection: { url: config.bullmq.redisUrl } as never,
    });
    service = new BulkService(AppDataSource, getS3Client(), parentQueue);
    worker = await startBulkDispatcherWorker({ publisher: (async () => {}) as never });

    const user = await AppDataSource.query(
      // Phase 3a: vendor owners use role='customer'; access via vendor_members
      `INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES ($1,'x','A','B','customer') RETURNING id`,
      [`bulkinv-${Date.now()}@ex.com`],
    );
    userId = user[0].id;
    const vendor = await AppDataSource.query(
      `INSERT INTO vendors (user_id, business_name, contact_email, status) VALUES ($1,'BulkInv Co','v@ex.com','approved') RETURNING id`,
      [userId],
    );
    vendorId = vendor[0].id;
    const wh = await AppDataSource.query(
      `INSERT INTO warehouses (vendor_id, name, code, address_line1, city, country_code, is_default, is_active) VALUES ($1,'Main','WH-01','x','Dubai','AE', true, true) RETURNING id`,
      [vendorId],
    );
    warehouseId = wh[0].id;
    const alpha = await AppDataSource.query(
      `INSERT INTO products (vendor_id, name, slug, price, currency, sku, status, category_id) VALUES ($1,'Alpha','alpha-'||gen_random_uuid(),10000,'AED','SKU-ALPHA','active', (SELECT id FROM categories LIMIT 1)) RETURNING id`,
      [vendorId],
    );
    productAlphaId = alpha[0].id;
    const beta = await AppDataSource.query(
      `INSERT INTO products (vendor_id, name, slug, price, currency, sku, status, category_id) VALUES ($1,'Beta','beta-'||gen_random_uuid(),20000,'AED','SKU-BETA','active', (SELECT id FROM categories LIMIT 1)) RETURNING id`,
      [vendorId],
    );
    productBetaId = beta[0].id;
    await AppDataSource.query(
      "INSERT INTO inventory (product_id, warehouse_id, quantity_on_hand, quantity_reserved, low_stock_threshold) VALUES ($1,$2,10,0,0)",
      [productAlphaId, warehouseId],
    );
  });

  afterAll(async () => {
    await AppDataSource.query("DELETE FROM inventory WHERE warehouse_id = $1", [warehouseId]);
    await AppDataSource.query("DELETE FROM bulk_import_jobs WHERE vendor_id = $1", [vendorId]);
    await AppDataSource.query("DELETE FROM products WHERE vendor_id = $1", [vendorId]);
    await AppDataSource.query("DELETE FROM warehouses WHERE vendor_id = $1", [vendorId]);
    await AppDataSource.query("DELETE FROM vendors WHERE id = $1", [vendorId]);
    await AppDataSource.query("DELETE FROM users WHERE id = $1", [userId]);
    await worker.close();
    await parentQueue.close();
  });

  async function uploadAndRun(fixtureName: string): Promise<BulkImportJob> {
    const buf = readFileSync(join(__dirname, "fixtures", fixtureName));

    const { jobId } = await service.initiate({
      jobType: BulkJobType.InventoryUpdate,
      fileName: fixtureName,
      fileSizeBytes: buf.length,
      fileFormat: BulkJobFileFormat.Csv,
      vendorId,
      initiatedByUserId: userId,
      initiatedByRole: UserRole.customer, // Phase 3a: vendor owners have role=customer
    });

    // Read the s3 key that initiate assigned to this job, then upload fixture bytes there.
    const created = await AppDataSource.getRepository(BulkImportJob).findOne({
      where: { id: jobId },
    });
    if (!created) throw new Error("job row missing after initiate");
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: config.media.s3Bucket,
        Key: created.file_s3_key,
        Body: buf,
      }),
    );

    await service.start(jobId);

    const deadline = Date.now() + 20_000;
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
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!job) throw new Error("job not found");
    return job;
  }

  test("valid file updates inventory and writes diff log", async () => {
    const job = await uploadAndRun("valid.csv");
    expect(job.status).toBe(BulkJobStatus.Completed);
    expect(job.succeeded_rows).toBe(2);
    const invAlpha = await AppDataSource.getRepository(Inventory).findOne({
      where: { product_id: productAlphaId, warehouse_id: warehouseId },
    });
    const invBeta = await AppDataSource.getRepository(Inventory).findOne({
      where: { product_id: productBetaId, warehouse_id: warehouseId },
    });
    expect(invAlpha?.quantity_on_hand).toBe(120);
    expect(invBeta?.quantity_on_hand).toBe(7);
    const changes = await AppDataSource.query(
      `SELECT old_value, new_value FROM bulk_import_job_row_changes WHERE job_id = $1 AND entity_type = 'inventory' AND entity_id = (SELECT id FROM inventory WHERE product_id = $2)`,
      [job.id, productAlphaId],
    );
    expect(changes[0].old_value).toBe(10);
    expect(changes[0].new_value).toBe(120);
  });

  test("all-or-nothing: mixed-error file leaves DB untouched", async () => {
    const pre = await AppDataSource.getRepository(Inventory).findOne({
      where: { product_id: productAlphaId, warehouse_id: warehouseId },
    });
    const preQty = pre?.quantity_on_hand;

    const job = await uploadAndRun("mixed-errors.csv");
    expect(job.status).toBe(BulkJobStatus.Failed);
    expect(job.error_report_s3_key).toBeTruthy();

    const post = await AppDataSource.getRepository(Inventory).findOne({
      where: { product_id: productAlphaId, warehouse_id: warehouseId },
    });
    expect(post?.quantity_on_hand).toBe(preQty);

    const errCount = await AppDataSource.query(
      "SELECT COUNT(*)::int AS c FROM bulk_import_job_row_errors WHERE job_id = $1",
      [job.id],
    );
    expect(errCount[0].c).toBeGreaterThanOrEqual(3);
  });
});
