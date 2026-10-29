import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Recompute `brands.product_count` from the live products table. The column is
 * a denormalized counter that wasn't being kept in sync (no trigger, no service
 * hook), so on staging every brand showed 0 even when products were linked —
 * which leaks into the homepage brand spotlight UI as "0 products" under each
 * brand name.
 *
 * Counts only published, non-deleted products, matching what the storefront
 * actually surfaces. Idempotent — re-running produces the same numbers.
 *
 * Note: this is a one-shot backfill. Long-term, the counter should be
 * maintained via a trigger or by the product create/update/delete service
 * methods. Tracked separately.
 */
export class BackfillBrandsProductCount1777920000000 implements MigrationInterface {
  name = "BackfillBrandsProductCount1777920000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE brands b
      SET product_count = sub.cnt
      FROM (
        SELECT brand_id, COUNT(*) AS cnt
        FROM products
        WHERE brand_id IS NOT NULL
          AND deleted_at IS NULL
          AND status = 'published'
        GROUP BY brand_id
      ) AS sub
      WHERE b.id = sub.brand_id
        AND b.product_count IS DISTINCT FROM sub.cnt;
    `);

    // Brands with zero published products: zero them out so a partially-stale
    // row doesn't keep an old non-zero count.
    await queryRunner.query(`
      UPDATE brands
      SET product_count = 0
      WHERE id NOT IN (
        SELECT brand_id FROM products
        WHERE brand_id IS NOT NULL
          AND deleted_at IS NULL
          AND status = 'published'
      ) AND product_count <> 0;
    `);
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // No-op. The previous values were stale by definition; we don't want to
    // restore them. Re-running up() is the recovery path.
  }
}
