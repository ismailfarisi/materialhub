import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Trade pricing and samples (roadmap items 1 and 2).
 *
 * - `product_variants` and `products` (for products without variants) gain a
 *   unit of measure, pack contents, a minimum order quantity and an order
 *   increment. Variants also gain a sample flag and a per-order sample cap.
 * - `variant_price_tiers`: quantity-break unit prices in fils. `variant_id`
 *   null means the tier belongs to a product without variants.
 * - `site_settings.sample_shipping_rate_fils`: the flat shipping charged per
 *   supplier when everything that supplier ships in an order is samples. A
 *   trigger bumps the checkout rules epoch when it changes, so quote tokens
 *   issued under the old rate are refused, as with shipping rate changes.
 *
 * Existing rows get min_order_quantity = 1 and order_increment = 1, so
 * nothing about current listings changes until a vendor sets trade terms.
 */
export class TradePricingAndSamples1793994763594 implements MigrationInterface {
  name = "TradePricingAndSamples1793994763594";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const units = `'sheet', 'roll', 'metre', 'pack', 'carton', 'box', 'piece', 'kg'`;

    // ── product_variants ────────────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "product_variants"
        ADD COLUMN IF NOT EXISTS "unit_of_measure" character varying(16),
        ADD COLUMN IF NOT EXISTS "units_per_pack" integer,
        ADD COLUMN IF NOT EXISTS "pack_contents_unit" character varying(16),
        ADD COLUMN IF NOT EXISTS "min_order_quantity" integer NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS "order_increment" integer NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS "is_sample" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "sample_max_quantity" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_variants"
        ADD CONSTRAINT "CHK_product_variants_unit_of_measure" CHECK ("unit_of_measure" IS NULL OR "unit_of_measure" IN (${units})),
        ADD CONSTRAINT "CHK_product_variants_pack_contents_unit" CHECK ("pack_contents_unit" IS NULL OR "pack_contents_unit" IN (${units})),
        ADD CONSTRAINT "CHK_product_variants_units_per_pack" CHECK ("units_per_pack" IS NULL OR "units_per_pack" >= 1),
        ADD CONSTRAINT "CHK_product_variants_min_order_quantity" CHECK ("min_order_quantity" >= 1),
        ADD CONSTRAINT "CHK_product_variants_order_increment" CHECK ("order_increment" >= 1),
        ADD CONSTRAINT "CHK_product_variants_sample_max_quantity" CHECK ("sample_max_quantity" IS NULL OR "sample_max_quantity" >= 1),
        ADD CONSTRAINT "CHK_product_variants_sample_terms" CHECK (NOT "is_sample" OR ("min_order_quantity" = 1 AND "order_increment" = 1))`,
    );
    // At most one live sample per product.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_product_variants_one_sample" ON "product_variants" ("product_id") WHERE "is_sample" AND "deleted_at" IS NULL`,
    );

    // ── products (no-variant listings) ──────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "products"
        ADD COLUMN IF NOT EXISTS "unit_of_measure" character varying(16),
        ADD COLUMN IF NOT EXISTS "units_per_pack" integer,
        ADD COLUMN IF NOT EXISTS "pack_contents_unit" character varying(16),
        ADD COLUMN IF NOT EXISTS "min_order_quantity" integer NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS "order_increment" integer NOT NULL DEFAULT 1`,
    );
    await queryRunner.query(
      `ALTER TABLE "products"
        ADD CONSTRAINT "CHK_products_unit_of_measure" CHECK ("unit_of_measure" IS NULL OR "unit_of_measure" IN (${units})),
        ADD CONSTRAINT "CHK_products_pack_contents_unit" CHECK ("pack_contents_unit" IS NULL OR "pack_contents_unit" IN (${units})),
        ADD CONSTRAINT "CHK_products_units_per_pack" CHECK ("units_per_pack" IS NULL OR "units_per_pack" >= 1),
        ADD CONSTRAINT "CHK_products_min_order_quantity" CHECK ("min_order_quantity" >= 1),
        ADD CONSTRAINT "CHK_products_order_increment" CHECK ("order_increment" >= 1)`,
    );

    // ── variant_price_tiers ─────────────────────────────────────────
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "variant_price_tiers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "product_id" uuid NOT NULL,
        "variant_id" uuid,
        "min_quantity" integer NOT NULL,
        "unit_price" integer NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_variant_price_tiers" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_variant_price_tiers_min_quantity" CHECK ("min_quantity" >= 2),
        CONSTRAINT "CHK_variant_price_tiers_unit_price" CHECK ("unit_price" >= 0),
        CONSTRAINT "FK_variant_price_tiers_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_variant_price_tiers_variant" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_variant_price_tiers_product_id" ON "variant_price_tiers" ("product_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_variant_price_tiers_variant_min" ON "variant_price_tiers" ("variant_id", "min_quantity") WHERE variant_id IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_variant_price_tiers_product_min" ON "variant_price_tiers" ("product_id", "min_quantity") WHERE variant_id IS NULL`,
    );

    // ── Sample shipping rate (admin setting) ────────────────────────
    await queryRunner.query(
      `INSERT INTO "site_settings" ("key", "value", "value_type", "setting_group", "description")
       VALUES ('sample_shipping_rate_fils', '1000', 'number', 'samples',
               'Flat shipping in fils charged per supplier when an order from that supplier contains only samples')
       ON CONFLICT ("key") DO NOTHING`,
    );
    await queryRunner.query(`CREATE OR REPLACE FUNCTION bump_rules_epoch_on_sample_setting() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.key = 'sample_shipping_rate_fils' AND NEW.value IS DISTINCT FROM OLD.value THEN
          UPDATE rules_epoch SET epoch = epoch + 1, updated_at = now() WHERE id = 1;
        END IF;
        RETURN NEW;
      END $$`);
    await queryRunner.query(
      "DROP TRIGGER IF EXISTS trg_bump_rules_epoch_sample_setting ON site_settings",
    );
    await queryRunner.query(`CREATE TRIGGER trg_bump_rules_epoch_sample_setting
      AFTER UPDATE ON site_settings
      FOR EACH ROW EXECUTE FUNCTION bump_rules_epoch_on_sample_setting()`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "DROP TRIGGER IF EXISTS trg_bump_rules_epoch_sample_setting ON site_settings",
    );
    await queryRunner.query("DROP FUNCTION IF EXISTS bump_rules_epoch_on_sample_setting()");
    await queryRunner.query(
      `DELETE FROM "site_settings" WHERE "key" = 'sample_shipping_rate_fils'`,
    );

    await queryRunner.query(`DROP TABLE IF EXISTS "variant_price_tiers"`);

    await queryRunner.query(
      `ALTER TABLE "products"
        DROP CONSTRAINT IF EXISTS "CHK_products_order_increment",
        DROP CONSTRAINT IF EXISTS "CHK_products_min_order_quantity",
        DROP CONSTRAINT IF EXISTS "CHK_products_units_per_pack",
        DROP CONSTRAINT IF EXISTS "CHK_products_pack_contents_unit",
        DROP CONSTRAINT IF EXISTS "CHK_products_unit_of_measure",
        DROP COLUMN IF EXISTS "order_increment",
        DROP COLUMN IF EXISTS "min_order_quantity",
        DROP COLUMN IF EXISTS "pack_contents_unit",
        DROP COLUMN IF EXISTS "units_per_pack",
        DROP COLUMN IF EXISTS "unit_of_measure"`,
    );

    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_product_variants_one_sample"`);
    await queryRunner.query(
      `ALTER TABLE "product_variants"
        DROP CONSTRAINT IF EXISTS "CHK_product_variants_sample_terms",
        DROP CONSTRAINT IF EXISTS "CHK_product_variants_sample_max_quantity",
        DROP CONSTRAINT IF EXISTS "CHK_product_variants_order_increment",
        DROP CONSTRAINT IF EXISTS "CHK_product_variants_min_order_quantity",
        DROP CONSTRAINT IF EXISTS "CHK_product_variants_units_per_pack",
        DROP CONSTRAINT IF EXISTS "CHK_product_variants_pack_contents_unit",
        DROP CONSTRAINT IF EXISTS "CHK_product_variants_unit_of_measure",
        DROP COLUMN IF EXISTS "sample_max_quantity",
        DROP COLUMN IF EXISTS "is_sample",
        DROP COLUMN IF EXISTS "order_increment",
        DROP COLUMN IF EXISTS "min_order_quantity",
        DROP COLUMN IF EXISTS "pack_contents_unit",
        DROP COLUMN IF EXISTS "units_per_pack",
        DROP COLUMN IF EXISTS "unit_of_measure"`,
    );
  }
}
