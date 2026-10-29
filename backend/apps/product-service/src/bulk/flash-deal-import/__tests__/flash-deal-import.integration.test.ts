import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { AppDataSource, FlashDeal } from "@materialhub/database";
import { IsNull } from "typeorm";
import { coerceFlashDealImportRow } from "../flash-deal-import.coerce.ts";
import { buildFlashDealImportContext } from "../flash-deal-import.context.ts";
import { validateFlashDealImport } from "../flash-deal-import.validate.ts";
import { writeFlashDealImportBatch } from "../flash-deal-import.write.ts";

const hasDb = !!process.env.DATABASE_URL;
const describeIfDb = hasDb ? describe : describe.skip;

interface Fixtures {
  vendorId: string;
  userId: string;
  productSimpleId: string; // product with sku=FDI-SIMPLE-<ts>, no variants, price=10000
  productSimpleSku: string;
  productWithVariantsId: string; // product with sku=FDI-WV-<ts>, has_variants=true
  productWithVariantsSku: string;
  variantId: string; // variant of productWithVariants, sku=FDI-VAR-<ts>
  variantSku: string;
}

let fx: Fixtures;

describeIfDb("flash_deal_import — integration", () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    fx = await seedFixtures();
  });

  afterAll(async () => {
    await cleanupFixtures(fx);
  });

  beforeEach(async () => {
    // Soft-delete any prior flash deals from previous test runs in this vendor
    await AppDataSource.query(
      "UPDATE flash_deals SET deleted_at = now() WHERE vendor_id = $1 AND deleted_at IS NULL",
      [fx.vendorId],
    );
  });

  test("happy path: creates a deal, snapshots original_price from product when blank", async () => {
    const ctx = await buildFlashDealImportContext({
      dataSource: AppDataSource,
      vendorId: fx.vendorId,
    });
    const row = makeRow(1, fx.productSimpleSku, {});
    const errors = validateFlashDealImport([row], ctx);
    expect(errors).toEqual([]);

    const coerced = coerceFlashDealImportRow(row);
    expect(coerced.ok).toBe(true);
    if (!coerced.ok) return;

    const writeCtx = makeFakeWriteCtx();
    const result = await writeFlashDealImportBatch([coerced.value], ctx, writeCtx);
    expect(result.succeeded).toHaveLength(1);
    expect(result.skipped).toEqual([]);

    const deals = await AppDataSource.getRepository(FlashDeal).find({
      where: { vendor_id: fx.vendorId, deleted_at: IsNull() },
    });
    expect(deals).toHaveLength(1);
    expect(deals[0]!.deal_price).toBe(7500);
    expect(deals[0]!.original_price).toBe(10000);
    expect(Number(deals[0]!.discount_percentage)).toBe(25);
  });

  test("in-file overlap: second row with same SKU + window → DUPLICATE_KEY_IN_FILE", async () => {
    const ctx = await buildFlashDealImportContext({
      dataSource: AppDataSource,
      vendorId: fx.vendorId,
    });
    const row1 = makeRow(1, fx.productSimpleSku, {});
    const row2 = makeRow(2, fx.productSimpleSku, {});
    const errors = validateFlashDealImport([row1, row2], ctx);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.errorCode).toBe("duplicate_key_in_file");
    expect(errors[0]!.rowNumber).toBe(2);
  });

  test("deal_price >= original_price → INVALID_PRICE", async () => {
    const ctx = await buildFlashDealImportContext({
      dataSource: AppDataSource,
      vendorId: fx.vendorId,
    });
    const errors = validateFlashDealImport(
      [makeRow(1, fx.productSimpleSku, { deal_price: "10000", original_price: "10000" })],
      ctx,
    );
    expect(errors[0]!.errorCode).toBe("invalid_price");
  });

  test("variant-having product without variant key → HAS_VARIANTS_BUT_NO_VARIANT_KEY", async () => {
    const ctx = await buildFlashDealImportContext({
      dataSource: AppDataSource,
      vendorId: fx.vendorId,
    });
    const errors = validateFlashDealImport([makeRow(1, fx.productWithVariantsSku, {})], ctx);
    expect(errors[0]!.errorCode).toBe("has_variants_but_no_variant_key");
  });

  test("targeting a variant directly succeeds", async () => {
    const ctx = await buildFlashDealImportContext({
      dataSource: AppDataSource,
      vendorId: fx.vendorId,
    });
    const row = makeRow(1, fx.variantSku, {});
    const errors = validateFlashDealImport([row], ctx);
    expect(errors).toEqual([]);
    const coerced = coerceFlashDealImportRow(row);
    if (!coerced.ok) throw new Error("coerce failed");

    const writeCtx = makeFakeWriteCtx();
    const result = await writeFlashDealImportBatch([coerced.value], ctx, writeCtx);
    expect(result.succeeded).toHaveLength(1);

    const deal = await AppDataSource.getRepository(FlashDeal).findOne({
      where: { vendor_id: fx.vendorId, deleted_at: IsNull() },
    });
    expect(deal?.variant_id).toBe(fx.variantId);
  });
});

function makeRow(rowNumber: number, sku: string, overrides: Record<string, string>) {
  return {
    rowNumber,
    sheetName: "FlashDeals",
    values: {
      sku,
      title: "Test deal",
      deal_price: "7500",
      starts_at: "2026-06-01 09:00",
      expires_at: "2026-06-08 09:00",
      ...overrides,
    },
  };
}

function makeFakeWriteCtx() {
  const changes: unknown[] = [];
  return {
    job: { id: "test-job-1", summary: {} } as never,
    manager: AppDataSource.manager,
    batchIndex: 0,
    logChange: (entry: unknown) => {
      changes.push(entry);
    },
    pushFollowUp: () => {},
  } as never;
}

async function seedFixtures(): Promise<Fixtures> {
  const ts = Date.now();
  const user = await AppDataSource.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES ($1,'x','A','B','customer') RETURNING id`,
    [`fdi-${ts}@ex.com`],
  );
  const userId = user[0].id;
  const vendor = await AppDataSource.query(
    `INSERT INTO vendors (user_id, name, slug, business_name, business_type, contact_email, contact_phone, status)
     VALUES ($1,'FDI Co','fdi-co-'||$2,'FDI Co','retail',$3,'+971000000','approved') RETURNING id`,
    [userId, String(ts), `fdi-vendor-${ts}@ex.com`],
  );
  const vendorId = vendor[0].id;
  await AppDataSource.query(
    `INSERT INTO vendor_members (vendor_id, user_id, email, role, status, accepted_at)
     VALUES ($1, $2, $3, 'owner', 'active', NOW())
     ON CONFLICT DO NOTHING`,
    [vendorId, userId, `fdi-${ts}@ex.com`.toLowerCase()],
  );
  const productSimpleSku = `FDI-SIMPLE-${ts}`;
  const productSimple = await AppDataSource.query(
    `INSERT INTO products (vendor_id, name, slug, price, currency, sku, status, category_id, has_variants)
     VALUES ($1,'FDI Simple','fdi-simple-'||gen_random_uuid(),10000,'AED',$2,'active',(SELECT id FROM categories LIMIT 1), false) RETURNING id`,
    [vendorId, productSimpleSku],
  );
  const productSimpleId = productSimple[0].id;
  const productWithVariantsSku = `FDI-WV-${ts}`;
  const productWithVariants = await AppDataSource.query(
    `INSERT INTO products (vendor_id, name, slug, price, currency, sku, status, category_id, has_variants)
     VALUES ($1,'FDI WithVariants','fdi-wv-'||gen_random_uuid(),20000,'AED',$2,'active',(SELECT id FROM categories LIMIT 1), true) RETURNING id`,
    [vendorId, productWithVariantsSku],
  );
  const productWithVariantsId = productWithVariants[0].id;
  const variantSku = `FDI-VAR-${ts}`;
  const variant = await AppDataSource.query(
    `INSERT INTO product_variants (product_id, name, sku, price, is_active, sort_order, option_values)
     VALUES ($1,'V1',$2,15000, true, 0, '{}'::jsonb) RETURNING id`,
    [productWithVariantsId, variantSku],
  );
  const variantId = variant[0].id;
  return {
    vendorId,
    userId,
    productSimpleId,
    productSimpleSku,
    productWithVariantsId,
    productWithVariantsSku,
    variantId,
    variantSku,
  };
}

async function cleanupFixtures(f: Fixtures): Promise<void> {
  await AppDataSource.query("DELETE FROM flash_deals WHERE vendor_id = $1", [f.vendorId]);
  await AppDataSource.query("DELETE FROM product_variants WHERE id = $1", [f.variantId]);
  await AppDataSource.query("DELETE FROM products WHERE id IN ($1, $2)", [
    f.productSimpleId,
    f.productWithVariantsId,
  ]);
  await AppDataSource.query("DELETE FROM vendors WHERE id = $1", [f.vendorId]);
  await AppDataSource.query("DELETE FROM users WHERE id = $1", [f.userId]);
}
