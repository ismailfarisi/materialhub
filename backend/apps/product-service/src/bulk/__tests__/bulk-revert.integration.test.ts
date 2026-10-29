import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { config } from "@materialhub/config";
import { AppDataSource } from "@materialhub/database";
import { getS3Client } from "@materialhub/utils";
import { Queue } from "bullmq";
import { BulkService } from "../bulk.service.ts";

const hasDb = !!process.env.DATABASE_URL;
const describeIfDb = hasDb ? describe : describe.skip;

const _CALLER_USER_ID = "44444444-4444-4444-4444-444444444444";

interface Fixtures {
  vendorId: string;
  vendorUserId: string;
  callerUserId: string;
  productId: string;
}

let fx: Fixtures;
let service: BulkService;
let parentQueue: Queue;

describeIfDb("BulkService.revert — integration", () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    parentQueue = new Queue("bulk-import-parent", {
      connection: { url: config.bullmq.redisUrl } as never,
    });
    service = new BulkService(AppDataSource, getS3Client(), parentQueue);
    fx = await seedFixtures();
  });

  afterAll(async () => {
    await cleanupFixtures(fx);
    await parentQueue?.close();
  });

  beforeEach(async () => {
    // Clean up any prior jobs/changes/deals
    await AppDataSource.query(
      "DELETE FROM bulk_import_job_row_changes WHERE job_id IN (SELECT id FROM bulk_import_jobs WHERE vendor_id = $1)",
      [fx.vendorId],
    );
    await AppDataSource.query("DELETE FROM bulk_import_jobs WHERE vendor_id = $1", [fx.vendorId]);
    await AppDataSource.query("DELETE FROM flash_deals WHERE vendor_id = $1", [fx.vendorId]);
  });

  test("revert idempotency: second call returns 409", async () => {
    const jobId = await seedCompletedFlashDealImport({ rowCount: 5 });
    const first = await service.revert(jobId, fx.callerUserId);
    expect(first.revertedCount).toBe(5);
    expect(first.skippedAlreadyDeletedCount).toBe(0);

    let secondCallError: unknown = null;
    try {
      await service.revert(jobId, fx.callerUserId);
    } catch (err) {
      secondCallError = err;
    }
    expect(secondCallError).not.toBeNull();
    expect((secondCallError as { statusCode: number }).statusCode).toBe(409);
  });

  test("manual delete between import and revert reduces revertedCount", async () => {
    const jobId = await seedCompletedFlashDealImport({ rowCount: 10 });
    const dealIds = (await AppDataSource.query(
      "SELECT id FROM flash_deals WHERE vendor_id = $1 AND deleted_at IS NULL ORDER BY created_at LIMIT 3",
      [fx.vendorId],
    )) as Array<{ id: string }>;
    await AppDataSource.query(
      "UPDATE flash_deals SET deleted_at = now() WHERE id = ANY($1::uuid[])",
      [dealIds.map((d) => d.id)],
    );

    const result = await service.revert(jobId, fx.callerUserId);
    expect(result.revertedCount).toBe(7);
    expect(result.skippedAlreadyDeletedCount).toBe(3);
  });

  test("wrong job type → UNSUPPORTED_JOB_TYPE", async () => {
    const jobId = await seedInventoryJob();
    let err: unknown = null;
    try {
      await service.revert(jobId, fx.callerUserId);
    } catch (e) {
      err = e;
    }
    expect(err).not.toBeNull();
    expect((err as { statusCode: number }).statusCode).toBe(400);
  });

  test("non-terminal state (running) → NOT_IN_TERMINAL_STATE", async () => {
    const jobId = await seedRunningFlashDealImport();
    let err: unknown = null;
    try {
      await service.revert(jobId, fx.callerUserId);
    } catch (e) {
      err = e;
    }
    expect(err).not.toBeNull();
    expect((err as { statusCode: number }).statusCode).toBe(400);
  });
});

async function seedFixtures(): Promise<Fixtures> {
  const ts = Date.now();
  // Vendor user
  const vendorUser = await AppDataSource.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES ($1,'x','A','B','customer') RETURNING id`,
    [`bulk-revert-vendor-${ts}@ex.com`],
  );
  const vendorUserId = vendorUser[0].id;
  // Caller user (admin — distinct from vendor user, used as reverted_by_user_id)
  const callerUser = await AppDataSource.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES ($1,'x','A','B','admin') RETURNING id`,
    [`bulk-revert-caller-${ts}@ex.com`],
  );
  const callerUserId = callerUser[0].id;
  const vendor = await AppDataSource.query(
    `INSERT INTO vendors (user_id, name, slug, business_name, business_type, contact_email, contact_phone, status)
     VALUES ($1,'Revert Co','revert-co-'||$2,'Revert Co','retail',$3,'+971000000','approved') RETURNING id`,
    [vendorUserId, String(ts), `bulk-revert-vendor-biz-${ts}@ex.com`],
  );
  const vendorId = vendor[0].id;
  await AppDataSource.query(
    `INSERT INTO vendor_members (vendor_id, user_id, email, role, status, accepted_at)
     VALUES ($1, $2, $3, 'owner', 'active', NOW())
     ON CONFLICT DO NOTHING`,
    [vendorId, vendorUserId, `bulk-revert-vendor-${ts}@ex.com`.toLowerCase()],
  );
  const product = await AppDataSource.query(
    `INSERT INTO products (vendor_id, name, slug, price, currency, sku, status, category_id, has_variants)
     VALUES ($1,'Revert Product','revert-prod-'||gen_random_uuid(),10000,'AED',$2,'active',(SELECT id FROM categories LIMIT 1), false) RETURNING id`,
    [vendorId, `BR-PROD-${ts}`],
  );
  const productId = product[0].id;
  return { vendorId, vendorUserId, callerUserId, productId };
}

async function cleanupFixtures(f: Fixtures): Promise<void> {
  await AppDataSource.query(
    "DELETE FROM bulk_import_job_row_changes WHERE job_id IN (SELECT id FROM bulk_import_jobs WHERE vendor_id = $1)",
    [f.vendorId],
  );
  await AppDataSource.query("DELETE FROM bulk_import_jobs WHERE vendor_id = $1", [f.vendorId]);
  await AppDataSource.query("DELETE FROM flash_deals WHERE vendor_id = $1", [f.vendorId]);
  await AppDataSource.query("DELETE FROM products WHERE id = $1", [f.productId]);
  await AppDataSource.query("DELETE FROM vendors WHERE id = $1", [f.vendorId]);
  await AppDataSource.query("DELETE FROM users WHERE id IN ($1, $2)", [
    f.vendorUserId,
    f.callerUserId,
  ]);
}

async function seedCompletedFlashDealImport(opts: { rowCount: number }): Promise<string> {
  const job = await AppDataSource.query(
    `INSERT INTO bulk_import_jobs (job_type, status, strictness, vendor_id, initiated_by_user_id, initiated_by_role, file_s3_key, file_name, file_size_bytes, file_format, total_rows, processed_rows, succeeded_rows, completed_at)
     VALUES ('flash_deal_import', 'completed', 'best_effort', $1, $2, 'vendor', 's3-test-key', 'test.csv', 100, 'csv', $3, $3, $3, now())
     RETURNING id`,
    [fx.vendorId, fx.vendorUserId, opts.rowCount],
  );
  const jobId = job[0].id;

  // Seed N flash_deals + matching _created row-changes
  for (let i = 0; i < opts.rowCount; i++) {
    const deal = await AppDataSource.query(
      `INSERT INTO flash_deals (product_id, vendor_id, title, deal_price, original_price, discount_percentage, starts_at, expires_at, is_active)
       VALUES ($1, $2, $3, 7500, 10000, 25.00, now() + interval '1 hour', now() + interval '1 day', true)
       RETURNING id`,
      [fx.productId, fx.vendorId, `Test deal ${i}`],
    );
    const dealId = deal[0].id;
    await AppDataSource.query(
      `INSERT INTO bulk_import_job_row_changes (job_id, row_number, entity_type, entity_id, field, old_value, new_value)
       VALUES ($1, $2, 'flash_deal', $3, '_created', NULL, $4::jsonb)`,
      [
        jobId,
        i + 1,
        dealId,
        JSON.stringify({
          product_id: fx.productId,
          variant_id: null,
          deal_price: 7500,
          original_price: 10000,
        }),
      ],
    );
  }

  return jobId;
}

async function seedInventoryJob(): Promise<string> {
  const job = await AppDataSource.query(
    `INSERT INTO bulk_import_jobs (job_type, status, strictness, vendor_id, initiated_by_user_id, initiated_by_role, file_s3_key, file_name, file_size_bytes, file_format, total_rows, processed_rows, succeeded_rows, completed_at)
     VALUES ('inventory_update', 'completed', 'all_or_nothing', $1, $2, 'vendor', 's3-test-key', 'test.csv', 100, 'csv', 1, 1, 1, now())
     RETURNING id`,
    [fx.vendorId, fx.vendorUserId],
  );
  return job[0].id;
}

async function seedRunningFlashDealImport(): Promise<string> {
  const job = await AppDataSource.query(
    `INSERT INTO bulk_import_jobs (job_type, status, strictness, vendor_id, initiated_by_user_id, initiated_by_role, file_s3_key, file_name, file_size_bytes, file_format)
     VALUES ('flash_deal_import', 'running', 'best_effort', $1, $2, 'vendor', 's3-test-key', 'test.csv', 100, 'csv')
     RETURNING id`,
    [fx.vendorId, fx.vendorUserId],
  );
  return job[0].id;
}
