import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Collapse duplicate inventory rows and add the unique index that prevents
 * them from ever coming back.
 *
 * Background: `inventory` never had a unique constraint on
 * (product_id, variant_id, warehouse_id). Several import paths used
 * `INSERT ... ON CONFLICT DO NOTHING` with no arbiter index (a no-op) or a
 * bare INSERT, so every re-import appended another row. On production this
 * produced 4,222 duplicate groups (~6,149 redundant live rows, ~55% of the
 * table). PR #314 stopped new duplicates from the catalog importer; this
 * migration cleans up the existing ones and installs the guardrail.
 *
 * De-dup rule — keep the row reflecting the most recent activity:
 *   last_restocked_at DESC NULLS LAST, updated_at DESC, created_at DESC, id DESC
 * The extras are SOFT-deleted (deleted_at = now()), consistent with the rest of
 * the schema and reversible. Quantities are NOT summed — the duplicates are
 * repeated opening-stock snapshots from re-imports, not additive stock. On
 * production only 7 of 4,222 groups had disagreeing quantities; for those the
 * latest restock/import wins.
 *
 * Movements and reservations that pointed at a soon-to-be-soft-deleted row are
 * re-pointed at the survivor first, so audit history and any reservation stay
 * attached to the live row (the FKs are ON DELETE CASCADE, but a soft delete is
 * an UPDATE and never cascades — the re-point is about keeping history visible,
 * not about avoiding a cascade).
 *
 * The index uses NULLS NOT DISTINCT (Postgres 15+) because variant_id is
 * nullable and almost every row is a simple product (variant_id IS NULL); a
 * plain unique index treats those NULLs as distinct and would not stop the
 * duplicates.
 */
export class DedupeInventoryAddUniqueIndex1782200000000 implements MigrationInterface {
  name = "DedupeInventoryAddUniqueIndex1782200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Identify losers (every live row in a group except the survivor) and
    //    the survivor each should fold into. PARTITION BY groups NULL variant_id
    //    rows together, matching the NULLS NOT DISTINCT index built below.
    await queryRunner.query(`
      CREATE TEMP TABLE "_inventory_dedup" ON COMMIT DROP AS
      WITH ranked AS (
        SELECT
          "id",
          first_value("id") OVER w AS survivor_id,
          row_number() OVER w AS rn
        FROM "inventory"
        WHERE "deleted_at" IS NULL
        WINDOW w AS (
          PARTITION BY "product_id", "variant_id", "warehouse_id"
          ORDER BY
            "last_restocked_at" DESC NULLS LAST,
            "updated_at" DESC,
            "created_at" DESC,
            "id" DESC
        )
      )
      SELECT "id" AS loser_id, survivor_id
      FROM ranked
      WHERE rn > 1
    `);

    // 2. Preserve audit trail / reservations by re-pointing them at the survivor.
    await queryRunner.query(`
      UPDATE "inventory_movements" m
      SET "inventory_id" = d.survivor_id
      FROM "_inventory_dedup" d
      WHERE m."inventory_id" = d.loser_id
    `);
    await queryRunner.query(`
      UPDATE "inventory_reservations" r
      SET "inventory_id" = d.survivor_id
      FROM "_inventory_dedup" d
      WHERE r."inventory_id" = d.loser_id
    `);

    // 3. Soft-delete the duplicate rows.
    await queryRunner.query(`
      UPDATE "inventory" i
      SET "deleted_at" = now(), "updated_at" = now()
      FROM "_inventory_dedup" d
      WHERE i."id" = d.loser_id
    `);

    // 4. Repair the denormalized quantity_available column, which several write
    //    paths left at its default (0). On production 11,089 of 11,277 live rows
    //    disagreed with on_hand - reserved. Fix every live row here.
    await queryRunner.query(`
      UPDATE "inventory"
      SET "quantity_available" = "quantity_on_hand" - "quantity_reserved",
          "updated_at" = now()
      WHERE "deleted_at" IS NULL
        AND "quantity_available" <> "quantity_on_hand" - "quantity_reserved"
    `);

    // 5. The guardrail. NULLS NOT DISTINCT so simple products (variant_id NULL)
    //    can't duplicate; partial on deleted_at so soft-deleted rows are ignored.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_inventory_product_variant_warehouse_active"
      ON "inventory" ("product_id", "variant_id", "warehouse_id")
      NULLS NOT DISTINCT
      WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Only the index is reversible. The de-dup soft-deletes are intentionally
    // left in place — there is no reliable way to distinguish rows soft-deleted
    // by this migration from ones deleted for other reasons.
    await queryRunner.query(`
      DROP INDEX IF EXISTS "uq_inventory_product_variant_warehouse_active"
    `);
  }
}
