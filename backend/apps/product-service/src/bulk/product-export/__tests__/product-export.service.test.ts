import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { config } from "@materialhub/config";
import {
  AppDataSource,
  BulkExportFileFormat,
  BulkExportJob,
  BulkExportJobStatus,
  ProductExportPreset,
  UserRole,
} from "@materialhub/database";
import { Queue } from "bullmq";
import { ProductExportRepository } from "../product-export.repository.ts";
import { ProductExportService, resolveProductExportScope } from "../product-export.service.ts";

const hasDb = !!process.env.DATABASE_URL;
const describeIfDb = hasDb ? describe : describe.skip;

describe("ProductExportService scope resolution", () => {
  test("uses requested vendor for admin exports", () => {
    expect(
      resolveProductExportScope({
        caller: { userId: "u1", role: UserRole.admin, vendorIds: [] },
        filters: { vendorId: "vendor_admin" },
      }),
    ).toEqual({ admin: true, vendorId: "vendor_admin" });
  });

  test("forces vendor exports to the caller vendor", () => {
    expect(
      resolveProductExportScope({
        caller: { userId: "u1", role: UserRole.customer, vendorIds: ["vendor_own"] },
        filters: {},
      }),
    ).toEqual({ admin: false, vendorId: "vendor_own" });
  });

  test("rejects vendor exports for another vendor", () => {
    expect(() =>
      resolveProductExportScope({
        caller: { userId: "u1", role: UserRole.customer, vendorIds: ["vendor_own"] },
        filters: { vendorId: "vendor_other" },
      }),
    ).toThrow("Cannot export another vendor");
  });
});

describeIfDb("ProductExportService persistence", () => {
  let queue: Queue;
  let service: ProductExportService;
  let userId: string;
  let vendorId: string;

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    queue = new Queue("product-export-test", {
      connection: { url: config.bullmq.redisUrl },
    });
    service = new ProductExportService(AppDataSource, {} as never, queue);

    const email = `product-export-${Date.now()}@example.com`;
    const user = await AppDataSource.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role)
       VALUES ($1, 'x', 'Export', 'User', 'customer') RETURNING id`,
      [email],
    );
    userId = user[0].id;

    const vendor = await AppDataSource.query(
      `INSERT INTO vendors (name, slug, business_name, business_type, contact_email, contact_phone, status)
       VALUES ('Export Vendor', $1, 'Export Vendor', 'retailer', $2, '+971500000000', 'approved') RETURNING id`,
      [`export-vendor-${Date.now()}`, email],
    );
    vendorId = vendor[0].id;
  });

  afterAll(async () => {
    await AppDataSource.query("DELETE FROM bulk_export_jobs WHERE initiated_by_user_id = $1", [
      userId,
    ]);
    await AppDataSource.query("DELETE FROM vendors WHERE id = $1", [vendorId]);
    await AppDataSource.query("DELETE FROM users WHERE id = $1", [userId]);
    await queue.close();
  });

  test("creates queued product export job", async () => {
    const job = await service.createProductExport({
      caller: { userId, role: UserRole.customer, vendorIds: [vendorId] },
      request: {
        format: BulkExportFileFormat.Xlsx,
        preset: ProductExportPreset.CatalogOverview,
        fieldGroups: ["identity", "pricing"],
        filters: {},
      },
    });

    expect(job.status).toBe(BulkExportJobStatus.Queued);
    expect(job.vendorId).toBe(vendorId);
    expect(job.fileName).toContain("product-export");
  });

  test("repository transitions job lifecycle", async () => {
    const repo = new ProductExportRepository(AppDataSource);
    const job = await AppDataSource.getRepository(BulkExportJob).save(
      AppDataSource.getRepository(BulkExportJob).create({
        job_type: "product_export" as never,
        status: BulkExportJobStatus.Queued,
        vendor_id: vendorId,
        initiated_by_user_id: userId,
        initiated_by_role: UserRole.customer,
        format: BulkExportFileFormat.Csv,
        preset: ProductExportPreset.Custom,
        field_groups: ["identity"],
        fields: ["id", "name"],
        filters: {},
        file_name: "test.csv",
        expires_at: new Date(Date.now() + 86_400_000),
        queued_at: new Date(),
      }),
    );

    await repo.markRunning(job.id);
    await repo.markCompleted(job.id, {
      fileS3Key: "exports/test.csv",
      fileSizeBytes: 10,
      rowCounts: { products: 1 },
    });

    const saved = await repo.findById(job.id);
    expect(saved?.status).toBe(BulkExportJobStatus.Completed);
    expect(saved?.file_s3_key).toBe("exports/test.csv");
  });
});
