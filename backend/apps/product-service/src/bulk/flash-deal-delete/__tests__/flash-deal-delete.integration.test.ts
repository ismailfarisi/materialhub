import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { WriteContext } from "@materialhub/bulk-jobs";
import { AppDataSource } from "@materialhub/database";
import { coerceFlashDealDeleteRow } from "../flash-deal-delete.coerce.ts";
import { buildFlashDealDeleteContext } from "../flash-deal-delete.context.ts";
import { writeFlashDealDeleteBatch } from "../flash-deal-delete.write.ts";

const hasDb = !!process.env.DATABASE_URL;
const describeIfDb = hasDb ? describe : describe.skip;

interface Fixtures {
  vendorId: string;
  userId: string;
  productSimpleId: string;
  productSimpleSku: string;
  productDeletedId: string;
  productDeletedSku: string;
}

let fx: Fixtures;

function makeFakeWriteCtx() {
  const changes: Array<{ field: string; entityId: string }> = [];
  const ctx = {
    job: { id: "test-job-1", summary: {} } as never,
    manager: AppDataSource.manager,
    batchIndex: 0,
    logChange: (entry: { field: string; entityId: string }) => {
      changes.push(entry);
    },
    pushFollowUp: () => {},
  } as never as WriteContext;
  return { ctx, changes };
}

function makeDeleteRow(rowNumber: number, sku: string) {
  return {
    rowNumber,
    sheetName: "FlashDeals",
    values: { sku },
  };
}

describeIfDb("flash_deal_delete — integration", () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    fx = await seedFixtures();
  });

  afterAll(async () => {
    await cleanupFixtures(fx);
  });

  beforeEach(async () => {
    // Remove all flash deals for this vendor so each test starts clean
    await AppDataSource.query("DELETE FROM flash_deals WHERE vendor_id = $1", [fx.vendorId]);
  });

  test("SKU with 1 active + 1 future deal → both soft-deleted, 2 _deleted diff-log entries", async () => {
    // Seed one active deal (now-1d to now+1d) and one future deal (now+7d to now+14d)
    await AppDataSource.query(
      `INSERT INTO flash_deals (vendor_id, product_id, title, deal_price, original_price, discount_percentage, starts_at, expires_at)
       VALUES ($1, $2, 'Active Deal', 7500, 10000, 25, now() - interval '1 day', now() + interval '1 day')`,
      [fx.vendorId, fx.productSimpleId],
    );
    await AppDataSource.query(
      `INSERT INTO flash_deals (vendor_id, product_id, title, deal_price, original_price, discount_percentage, starts_at, expires_at)
       VALUES ($1, $2, 'Future Deal', 6000, 10000, 40, now() + interval '7 days', now() + interval '14 days')`,
      [fx.vendorId, fx.productSimpleId],
    );

    const deleteCtx = await buildFlashDealDeleteContext({
      dataSource: AppDataSource,
      vendorId: fx.vendorId,
    });

    const parsed = makeDeleteRow(1, fx.productSimpleSku);
    const coerced = coerceFlashDealDeleteRow(parsed);
    expect(coerced.ok).toBe(true);
    if (!coerced.ok) return;

    const { ctx: writeCtx, changes } = makeFakeWriteCtx();
    const result = await writeFlashDealDeleteBatch([coerced.value], deleteCtx, writeCtx);

    expect(result.succeeded).toHaveLength(1);
    expect(result.skipped).toEqual([]);
    expect(changes.filter((c) => c.field === "_deleted").length).toBe(2);

    // Both flash_deals should now be soft-deleted
    const remaining = await AppDataSource.query(
      "SELECT id FROM flash_deals WHERE vendor_id = $1 AND deleted_at IS NULL",
      [fx.vendorId],
    );
    expect(remaining).toHaveLength(0);
  });

  test("SKU with no deals → row marked skipped with no_active_deals", async () => {
    // No deals seeded — deleteCtx will have empty dealsByProductVariant
    const deleteCtx = await buildFlashDealDeleteContext({
      dataSource: AppDataSource,
      vendorId: fx.vendorId,
    });

    const parsed = makeDeleteRow(1, fx.productSimpleSku);
    const coerced = coerceFlashDealDeleteRow(parsed);
    expect(coerced.ok).toBe(true);
    if (!coerced.ok) return;

    const { ctx: writeCtx } = makeFakeWriteCtx();
    const result = await writeFlashDealDeleteBatch([coerced.value], deleteCtx, writeCtx);

    expect(result.succeeded).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.reason).toBe("no_active_deals");
  });

  test("soft-deleted product with active deals → deals still cleaned up", async () => {
    // Soft-delete the product
    await AppDataSource.query("UPDATE products SET deleted_at = now() WHERE id = $1", [
      fx.productDeletedId,
    ]);

    // Seed a flash deal on the now-soft-deleted product
    await AppDataSource.query(
      `INSERT INTO flash_deals (vendor_id, product_id, title, deal_price, original_price, discount_percentage, starts_at, expires_at)
       VALUES ($1, $2, 'Lingering Deal', 5000, 10000, 50, now() - interval '1 day', now() + interval '1 day')`,
      [fx.vendorId, fx.productDeletedId],
    );

    const deleteCtx = await buildFlashDealDeleteContext({
      dataSource: AppDataSource,
      vendorId: fx.vendorId,
    });

    const parsed = makeDeleteRow(1, fx.productDeletedSku);
    const coerced = coerceFlashDealDeleteRow(parsed);
    expect(coerced.ok).toBe(true);
    if (!coerced.ok) return;

    const { ctx: writeCtx, changes } = makeFakeWriteCtx();
    const result = await writeFlashDealDeleteBatch([coerced.value], deleteCtx, writeCtx);

    expect(result.succeeded).toHaveLength(1);
    expect(result.skipped).toEqual([]);
    expect(changes.filter((c) => c.field === "_deleted").length).toBe(1);

    // Restore product soft-delete state for cleanup
    await AppDataSource.query("UPDATE products SET deleted_at = NULL WHERE id = $1", [
      fx.productDeletedId,
    ]);
  });

  test("row with multiple deals → succeeded count is 1 but multiple _deleted entries", async () => {
    // Seed three deals on the same SKU
    for (let i = 0; i < 3; i++) {
      await AppDataSource.query(
        `INSERT INTO flash_deals (vendor_id, product_id, title, deal_price, original_price, discount_percentage, starts_at, expires_at)
         VALUES ($1, $2, $3, 7000, 10000, 30, now() + interval '${i} days', now() + interval '${i + 5} days')`,
        [fx.vendorId, fx.productSimpleId, `Deal ${i}`],
      );
    }

    const deleteCtx = await buildFlashDealDeleteContext({
      dataSource: AppDataSource,
      vendorId: fx.vendorId,
    });

    const parsed = makeDeleteRow(1, fx.productSimpleSku);
    const coerced = coerceFlashDealDeleteRow(parsed);
    expect(coerced.ok).toBe(true);
    if (!coerced.ok) return;

    const { ctx: writeCtx, changes } = makeFakeWriteCtx();
    const result = await writeFlashDealDeleteBatch([coerced.value], deleteCtx, writeCtx);

    // One row processed → one succeeded entry
    expect(result.succeeded).toHaveLength(1);
    expect(result.skipped).toEqual([]);
    // But three deals were deleted → three _deleted diff-log entries
    expect(changes.filter((c) => c.field === "_deleted").length).toBe(3);
  });
});

async function seedFixtures(): Promise<Fixtures> {
  const ts = Date.now();
  const user = await AppDataSource.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES ($1,'x','A','B','customer') RETURNING id`,
    [`fdd-${ts}@ex.com`],
  );
  const userId = user[0].id;
  const vendor = await AppDataSource.query(
    `INSERT INTO vendors (user_id, name, slug, business_name, business_type, contact_email, contact_phone, status)
     VALUES ($1,'FDD Co','fdd-co-'||$2,'FDD Co','retail',$3,'+971000000','approved') RETURNING id`,
    [userId, String(ts), `fdd-vendor-${ts}@ex.com`],
  );
  const vendorId = vendor[0].id;
  await AppDataSource.query(
    `INSERT INTO vendor_members (vendor_id, user_id, email, role, status, accepted_at)
     VALUES ($1, $2, $3, 'owner', 'active', NOW())
     ON CONFLICT DO NOTHING`,
    [vendorId, userId, `fdd-${ts}@ex.com`.toLowerCase()],
  );

  const productSimpleSku = `FDD-SIMPLE-${ts}`;
  const productSimple = await AppDataSource.query(
    `INSERT INTO products (vendor_id, name, slug, price, currency, sku, status, category_id, has_variants)
     VALUES ($1,'FDD Simple','fdd-simple-'||gen_random_uuid(),10000,'AED',$2,'active',(SELECT id FROM categories LIMIT 1), false) RETURNING id`,
    [vendorId, productSimpleSku],
  );
  const productSimpleId = productSimple[0].id;

  const productDeletedSku = `FDD-DELETED-${ts}`;
  const productDeleted = await AppDataSource.query(
    `INSERT INTO products (vendor_id, name, slug, price, currency, sku, status, category_id, has_variants)
     VALUES ($1,'FDD Deleted','fdd-deleted-'||gen_random_uuid(),10000,'AED',$2,'active',(SELECT id FROM categories LIMIT 1), false) RETURNING id`,
    [vendorId, productDeletedSku],
  );
  const productDeletedId = productDeleted[0].id;

  return {
    vendorId,
    userId,
    productSimpleId,
    productSimpleSku,
    productDeletedId,
    productDeletedSku,
  };
}

async function cleanupFixtures(f: Fixtures): Promise<void> {
  await AppDataSource.query("DELETE FROM flash_deals WHERE vendor_id = $1", [f.vendorId]);
  await AppDataSource.query("DELETE FROM products WHERE id IN ($1, $2)", [
    f.productSimpleId,
    f.productDeletedId,
  ]);
  await AppDataSource.query("DELETE FROM vendors WHERE id = $1", [f.vendorId]);
  await AppDataSource.query("DELETE FROM users WHERE id = $1", [f.userId]);
}
