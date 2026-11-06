// Runs against a migrated Postgres (DATABASE_URL set, as for the other
// integration tests): tiers are replaced as a set, the sample variant is
// created, capped, deactivated, and never sets the listing's price.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

mock.module("../search/search-sync.job.ts", () => ({ enqueueSearchSync: async () => {} }));

const { AppDataSource, Product, ProductVariant, VariantPriceTier } = await import(
  "@materialhub/database"
);
const { HttpError } = await import("@materialhub/plugins");
const { TradePricingService } = await import("./trade-pricing.service.ts");

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

describeIfDb("TradePricingService — integration", () => {
  let vendorId: string;
  let productId: string;
  let variantId: string;
  const restocks: any[] = [];
  const synced: string[] = [];
  const svc = new TradePricingService(
    { restock: async (_v: string, d: any) => restocks.push(d) } as any,
    async (id) => {
      synced.push(id);
    },
  );

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const [vendor] = await AppDataSource.query(
      `INSERT INTO vendors (business_name, business_type, contact_email, contact_phone, status, slug, name)
       VALUES ('Board Supply Test','llc','board@materialhub.test','+971500000000','approved','board-supply-'||gen_random_uuid(),'Board Supply Test') RETURNING id`,
    );
    vendorId = vendor.id;
    const [product] = await AppDataSource.query(
      `INSERT INTO products (vendor_id, name, slug, price, currency, status, category_id, has_variants)
       VALUES ($1,'Greyboard 2.0 mm','greyboard-'||gen_random_uuid(),600,'AED','draft',(SELECT id FROM categories LIMIT 1), true) RETURNING id`,
      [vendorId],
    );
    productId = product.id;
    const [variant] = await AppDataSource.query(
      `INSERT INTO product_variants (product_id, name, option_values, price) VALUES ($1,'70 × 100 cm','{"size":"70x100"}',600) RETURNING id`,
      [productId],
    );
    variantId = variant.id;
  });

  afterAll(async () => {
    if (productId) await AppDataSource.query("DELETE FROM products WHERE id = $1", [productId]);
    if (vendorId) await AppDataSource.query("DELETE FROM vendors WHERE id = $1", [vendorId]);
  });

  test("saves terms and replaces tiers as a set", async () => {
    await svc.set(productId, vendorId, {
      variant_id: variantId,
      unit_of_measure: "sheet",
      min_order_quantity: 10,
      order_increment: 5,
      tiers: [
        { min_quantity: 50, unit_price: 540 },
        { min_quantity: 200, unit_price: 480 },
      ],
    });
    let view = await svc.set(productId, vendorId, {
      variant_id: variantId,
      tiers: [{ min_quantity: 100, unit_price: 500 }],
    });
    const v = view.variants.find((x) => x.variant_id === variantId)!;
    expect(v).toMatchObject({
      unit_of_measure: "sheet",
      min_order_quantity: 10,
      order_increment: 5,
    });
    expect(v.tiers).toEqual([{ min_quantity: 100, unit_price: 500 }]);

    // Leaving tiers out keeps them, but re-checks them against the new minimum.
    view = await svc.set(productId, vendorId, { variant_id: variantId, order_increment: 10 });
    expect(view.variants[0]?.tiers).toHaveLength(1);
    await expect(
      svc.set(productId, vendorId, { variant_id: variantId, min_order_quantity: 100 }),
    ).rejects.toMatchObject({ code: "TIER_BELOW_MIN_ORDER" });
  });

  test("refuses another vendor", async () => {
    const err = await svc
      .get(productId, "00000000-0000-0000-0000-000000000000")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as InstanceType<typeof HttpError>).statusCode).toBe(404);
  });

  test("creates, updates and turns off the sample", async () => {
    let view = await svc.setSample(productId, vendorId, {
      enabled: true,
      price: 300,
      max_quantity: 3,
      quantity_on_hand: 40,
    });
    expect(view.sample).toMatchObject({ enabled: true, price: 300, max_quantity: 3 });
    expect(view.variants.every((v) => v.variant_id !== view.sample?.variant_id)).toBe(true);
    expect(restocks.at(-1)).toMatchObject({ product_id: productId, quantity: 40 });
    expect(synced).toContain(productId);

    const row = await AppDataSource.getRepository(ProductVariant).findOneByOrFail({
      id: view.sample!.variant_id,
    });
    expect(row).toMatchObject({ is_sample: true, min_order_quantity: 1, order_increment: 1 });

    // A second enable reuses the same row (one sample per product).
    view = await svc.setSample(productId, vendorId, { enabled: true, price: 250 });
    expect(view.sample?.variant_id).toBe(row.id);
    expect(view.sample?.price).toBe(250);

    view = await svc.setSample(productId, vendorId, { enabled: false });
    expect(view.sample?.enabled).toBe(false);

    await expect(
      svc.set(productId, vendorId, { variant_id: row.id, min_order_quantity: 5 }),
    ).rejects.toMatchObject({ code: "SAMPLE_HAS_NO_TRADE_TERMS" });
  });

  test("the database refuses a second live sample and a sample with a minimum", async () => {
    await expect(
      AppDataSource.query(
        `INSERT INTO product_variants (product_id, name, option_values, price, is_sample) VALUES ($1,'x','{}',1,true),($1,'y','{}',1,true)`,
        [productId],
      ),
    ).rejects.toThrow();
    await expect(
      AppDataSource.query(
        "UPDATE product_variants SET min_order_quantity = 5 WHERE product_id = $1 AND is_sample",
        [productId],
      ),
    ).rejects.toThrow();
    const tiers = await AppDataSource.getRepository(VariantPriceTier).countBy({
      product_id: productId,
    });
    expect(tiers).toBe(1);
    expect(await AppDataSource.getRepository(Product).countBy({ id: productId })).toBe(1);
  });
});
