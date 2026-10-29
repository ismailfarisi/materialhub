import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { AppDataSource } from "@materialhub/database";
import { buildCatalogImportContext } from "../catalog-import.context.ts";

const hasDb = !!process.env.DATABASE_URL;
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb("buildCatalogImportContext", () => {
  let vendorId: string;
  let userId: string;

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const ctxEmail = `ctxtest-${Date.now()}@ex.com`;
    const u = await AppDataSource.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES ($1,'x','A','B','customer') RETURNING id`,
      [ctxEmail],
    );
    userId = u[0].id;
    const v = await AppDataSource.query(
      `INSERT INTO vendors (user_id, business_name, contact_email, status) VALUES ($1,'Ctx Co','c@ex.com','approved') RETURNING id`,
      [userId],
    );
    vendorId = v[0].id;
    await AppDataSource.query(
      `INSERT INTO vendor_members (vendor_id, user_id, email, role, status, accepted_at)
       VALUES ($1, $2, $3, 'owner', 'active', NOW())
       ON CONFLICT DO NOTHING`,
      [vendorId, userId, ctxEmail.toLowerCase()],
    );
  });

  afterAll(async () => {
    await AppDataSource.query("DELETE FROM vendors WHERE id = $1", [vendorId]);
    await AppDataSource.query("DELETE FROM users WHERE id = $1", [userId]);
  });

  test("preloads categories, attributes, attribute_values, category_attributes", async () => {
    const ctx = await buildCatalogImportContext({
      dataSource: AppDataSource,
      vendorId,
    });
    expect(ctx.vendorId).toBe(vendorId);
    expect(ctx.categoriesBySlug.size).toBeGreaterThan(0);
    expect(ctx.attributesBySlug).toBeDefined();
  });

  test("preloads default warehouse", async () => {
    const wh = await AppDataSource.query(
      `INSERT INTO warehouses (vendor_id, name, code, address_line_1, city, emirate, country_code, is_default, is_active) VALUES ($1,'M','WH-TEST','x','Dubai','Dubai','AE',true,true) RETURNING id`,
      [vendorId],
    );
    const ctx = await buildCatalogImportContext({
      dataSource: AppDataSource,
      vendorId,
    });
    expect(ctx.defaultWarehouseId).toBe(wh[0].id);
  });
});
