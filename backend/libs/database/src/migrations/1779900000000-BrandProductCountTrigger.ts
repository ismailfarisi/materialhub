import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Keeps `brands.product_count` in sync with `products` via a Postgres trigger.
 *
 * The denormalized counter was previously only set by a one-shot backfill
 * migration (1777920000000), so any product add/publish/unpublish/delete after
 * that migration ran left the counter stale. The homepage brand spotlight
 * orders by `is_featured DESC, sort_order ASC, product_count DESC, name ASC`,
 * so a stale 0 hides a real brand behind alphabetically-earlier empty brands.
 *
 * The trigger fires only when a column relevant to the count changes
 * (brand_id, status, deleted_at) so the cost on routine product updates
 * (name, description, price) is zero. Each fire is a single subquery against
 * `products` for the affected brand(s) — cheap with the existing index on
 * `products.brand_id`.
 *
 * As part of `up()` we also recompute counts for every brand so the schema
 * lands consistent without needing the admin "Recompute counts" button.
 */
export class BrandProductCountTrigger1779900000000 implements MigrationInterface {
  name = "BrandProductCountTrigger1779900000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION sync_brand_product_count_on_change()
      RETURNS TRIGGER AS $$
      DECLARE
        ids uuid[] := ARRAY[]::uuid[];
      BEGIN
        IF TG_OP <> 'DELETE' AND NEW.brand_id IS NOT NULL THEN
          ids := array_append(ids, NEW.brand_id);
        END IF;
        IF TG_OP <> 'INSERT' AND OLD.brand_id IS NOT NULL
           AND (TG_OP = 'DELETE' OR OLD.brand_id IS DISTINCT FROM NEW.brand_id) THEN
          ids := array_append(ids, OLD.brand_id);
        END IF;

        IF array_length(ids, 1) IS NULL THEN
          RETURN NULL;
        END IF;

        UPDATE brands b
           SET product_count = COALESCE((
             SELECT COUNT(*)::int
               FROM products p
              WHERE p.brand_id = b.id
                AND p.status = 'published'
                AND p.deleted_at IS NULL
           ), 0)
         WHERE b.id = ANY(ids);

        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_sync_brand_product_count_ins ON products;
      DROP TRIGGER IF EXISTS trg_sync_brand_product_count_del ON products;
      DROP TRIGGER IF EXISTS trg_sync_brand_product_count_upd ON products;
    `);

    await queryRunner.query(`
      CREATE TRIGGER trg_sync_brand_product_count_ins
      AFTER INSERT ON products
      FOR EACH ROW
      EXECUTE FUNCTION sync_brand_product_count_on_change();
    `);

    await queryRunner.query(`
      CREATE TRIGGER trg_sync_brand_product_count_del
      AFTER DELETE ON products
      FOR EACH ROW
      EXECUTE FUNCTION sync_brand_product_count_on_change();
    `);

    // Update trigger fires only when a count-relevant column changes.
    await queryRunner.query(`
      CREATE TRIGGER trg_sync_brand_product_count_upd
      AFTER UPDATE OF brand_id, status, deleted_at ON products
      FOR EACH ROW
      WHEN (OLD.brand_id IS DISTINCT FROM NEW.brand_id
         OR OLD.status IS DISTINCT FROM NEW.status
         OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
      EXECUTE FUNCTION sync_brand_product_count_on_change();
    `);

    // One-time reconciliation: bring every brand in line with current products.
    // Idempotent — re-running yields the same values.
    await queryRunner.query(`
      UPDATE brands b
         SET product_count = COALESCE((
           SELECT COUNT(*)::int
             FROM products p
            WHERE p.brand_id = b.id
              AND p.status = 'published'
              AND p.deleted_at IS NULL
         ), 0)
       WHERE b.deleted_at IS NULL;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TRIGGER IF EXISTS trg_sync_brand_product_count_ins ON products;");
    await queryRunner.query("DROP TRIGGER IF EXISTS trg_sync_brand_product_count_del ON products;");
    await queryRunner.query("DROP TRIGGER IF EXISTS trg_sync_brand_product_count_upd ON products;");
    await queryRunner.query("DROP FUNCTION IF EXISTS sync_brand_product_count_on_change();");
  }
}
