import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { config } from "@materialhub/config";
import {
  AppDataSource,
  BulkImportJob,
  BulkImportMode,
  BulkJobFileFormat,
  BulkJobStatus,
  BulkJobType,
} from "@materialhub/database";
import { getS3Client } from "@materialhub/utils";
import { Queue } from "bullmq";
import { BulkService } from "../bulk.service.ts";

// The test requires a live Postgres connection. Skip gracefully when not available.
const hasDb = !!process.env.DATABASE_URL;
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb("BulkService — Phase 0 surface", () => {
  let parentQueue: Queue;
  let service: BulkService;
  let seededVendorId: string;
  let seededUserId: string;

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    parentQueue = new Queue("bulk-import-parent-test", {
      connection: { url: config.bullmq.redisUrl },
    });
    service = new BulkService(AppDataSource, getS3Client(), parentQueue);

    const ts = Date.now();
    const email = `bulktest-${ts}@example.com`;

    const user = await AppDataSource.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role)
       VALUES ($1, 'x', 'A', 'B', 'customer') RETURNING id`,
      [email],
    );
    seededUserId = user[0].id;

    const vendor = await AppDataSource.query(
      `INSERT INTO vendors (user_id, name, slug, business_name, business_type, contact_email, contact_phone, status)
       VALUES ($1, 'BulkTest Co', $2, 'BulkTest Co', 'retailer', $3, '+971500000000', 'approved') RETURNING id`,
      [seededUserId, `bulktest-${ts}`, email],
    );
    seededVendorId = vendor[0].id;
    await AppDataSource.query(
      `INSERT INTO vendor_members (vendor_id, user_id, email, role, status, accepted_at)
       VALUES ($1, $2, $3, 'owner', 'active', NOW())
       ON CONFLICT DO NOTHING`,
      [seededVendorId, seededUserId, email.toLowerCase()],
    );
  });

  afterAll(async () => {
    await AppDataSource.query("DELETE FROM bulk_import_jobs WHERE initiated_by_user_id = $1", [
      seededUserId,
    ]);
    await AppDataSource.query("DELETE FROM vendors WHERE id = $1", [seededVendorId]);
    await AppDataSource.query("DELETE FROM users WHERE id = $1", [seededUserId]);
    await parentQueue.close();
    // Don't destroy AppDataSource — other test files may need it.
  });

  test("initiate creates a pending_upload job and returns a presigned URL", async () => {
    const result = await service.initiate({
      jobType: BulkJobType.InventoryUpdate,
      fileName: "test.csv",
      fileSizeBytes: 1024,
      fileFormat: BulkJobFileFormat.Csv,
      vendorId: seededVendorId,
      initiatedByUserId: seededUserId,
      initiatedByRole: "customer",
    });
    expect(result.jobId).toBeTruthy();
    expect(result.presignedUrl).toMatch(/^https?:\/\//);
    expect(result.s3Key).toContain(seededVendorId);
    expect(result.s3Key).toContain(result.jobId);

    const job = await AppDataSource.getRepository(BulkImportJob).findOne({
      where: { id: result.jobId },
    });
    expect(job?.status).toBe(BulkJobStatus.PendingUpload);
    expect(job?.file_s3_key).toBe(result.s3Key);
    expect(job?.vendor_id).toBe(seededVendorId);
  });

  test("start on an unregistered job type throws not_implemented", async () => {
    const { jobId } = await service.initiate({
      jobType: BulkJobType.InventoryUpdate,
      fileName: "t2.csv",
      fileSizeBytes: 100,
      fileFormat: BulkJobFileFormat.Csv,
      vendorId: seededVendorId,
      initiatedByUserId: seededUserId,
      initiatedByRole: "customer",
    });
    // Use try/catch instead of rejects.toThrow due to bun v1.3.11 limitation
    // with expect().rejects.toThrow() after DB-accessing async functions.
    let thrown: Error | null = null;
    try {
      await service.start(jobId);
    } catch (e) {
      thrown = e as Error;
    }
    expect(thrown?.message).toBe("not_implemented");
  });

  test("cancel records cancel_requested_at", async () => {
    const { jobId } = await service.initiate({
      jobType: BulkJobType.InventoryUpdate,
      fileName: "t3.csv",
      fileSizeBytes: 100,
      fileFormat: BulkJobFileFormat.Csv,
      vendorId: seededVendorId,
      initiatedByUserId: seededUserId,
      initiatedByRole: "customer",
    });
    await service.cancel(jobId);
    const job = await AppDataSource.getRepository(BulkImportJob).findOne({
      where: { id: jobId },
    });
    expect(job?.cancel_requested_at).toBeTruthy();
  });

  test("start on PendingUpload job without queueing a second (concurrent-job guard when workers are registered in Plans B/C)", async () => {
    // With no job types registered, start always throws not_implemented — this test
    // is a placeholder verifying the code path at least reaches the implementation check.
    // Full concurrent-job-guard testing lives in Phase 1/2 integration tests.
    const { jobId } = await service.initiate({
      jobType: BulkJobType.CatalogImport,
      fileName: "t4.csv",
      fileSizeBytes: 100,
      fileFormat: BulkJobFileFormat.Csv,
      vendorId: seededVendorId,
      initiatedByUserId: seededUserId,
      initiatedByRole: "customer",
    });
    let thrown: Error | null = null;
    try {
      await service.start(jobId);
    } catch (e) {
      thrown = e as Error;
    }
    expect(thrown?.message).toBe("not_implemented");
  });

  test("initiate persists import_mode = update when requested", async () => {
    const { jobId } = await service.initiate({
      jobType: BulkJobType.CatalogImport,
      fileName: "upd.csv",
      fileSizeBytes: 100,
      fileFormat: BulkJobFileFormat.Csv,
      mode: BulkImportMode.Update,
      vendorId: seededVendorId,
      initiatedByUserId: seededUserId,
      initiatedByRole: "customer",
    });
    const job = await AppDataSource.getRepository(BulkImportJob).findOne({ where: { id: jobId } });
    expect(job?.import_mode).toBe(BulkImportMode.Update);
  });

  test("initiate defaults import_mode = upsert", async () => {
    const { jobId } = await service.initiate({
      jobType: BulkJobType.CatalogImport,
      fileName: "def.csv",
      fileSizeBytes: 100,
      fileFormat: BulkJobFileFormat.Csv,
      vendorId: seededVendorId,
      initiatedByUserId: seededUserId,
      initiatedByRole: "customer",
    });
    const job = await AppDataSource.getRepository(BulkImportJob).findOne({ where: { id: jobId } });
    expect(job?.import_mode).toBe(BulkImportMode.Upsert);
  });
});
