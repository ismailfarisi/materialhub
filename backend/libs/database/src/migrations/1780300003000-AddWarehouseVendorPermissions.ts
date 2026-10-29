import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddWarehouseVendorPermissions1780300003000 implements MigrationInterface {
  name = "AddWarehouseVendorPermissions1780300003000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "warehouse_vendor_permissions" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "warehouse_id" uuid NOT NULL,
        "vendor_id" uuid NOT NULL,
        "permission" varchar(64) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "granted_by_user_id" uuid,
        "reason" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_warehouse_vendor_permissions" PRIMARY KEY ("id"),
        CONSTRAINT "fk_wvp_warehouse" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id"),
        CONSTRAINT "fk_wvp_vendor" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id"),
        CONSTRAINT "fk_wvp_granted_by" FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_warehouse_vendor_permissions_active"
      ON "warehouse_vendor_permissions" ("warehouse_id", "vendor_id", "permission")
      WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_warehouses_code_active"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_83aa06f91f6d263d94834d78a9"
    `);
    await queryRunner.query(`
      ALTER TABLE "warehouses" DROP CONSTRAINT IF EXISTS "warehouses_code_key"
    `);
    await queryRunner.query(`
      ALTER TABLE "warehouses" DROP CONSTRAINT IF EXISTS "UQ_83aa06f91f6d263d94834d78a9"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_warehouses_code_active"
      ON "warehouses" ("code")
      WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE TEMP TABLE "_inventory_warehouse_backfill" ON COMMIT DROP AS
      WITH defaults AS (
        SELECT "vendor_id", "id" AS "warehouse_id"
        FROM "warehouses"
        WHERE "vendor_id" IS NOT NULL
          AND "is_default" = true
          AND "is_active" = true
          AND "deleted_at" IS NULL
      ),
      legacy AS (
        SELECT
          i."id",
          i."product_id",
          i."variant_id",
          i."vendor_id",
          d."warehouse_id",
          row_number() OVER (
            PARTITION BY i."product_id", i."variant_id", i."vendor_id", d."warehouse_id"
            ORDER BY i."updated_at" DESC, i."created_at" DESC, i."id" DESC
          ) AS rn
        FROM "inventory" i
        INNER JOIN defaults d ON d."vendor_id" = i."vendor_id"
        WHERE i."warehouse_id" IS NULL
          AND i."deleted_at" IS NULL
      )
      SELECT
        l."id" AS "source_id",
        l."warehouse_id" AS "target_warehouse_id",
        COALESCE(existing."id", winner."id") AS "target_id"
      FROM legacy l
      INNER JOIN legacy winner
        ON winner."product_id" = l."product_id"
       AND winner."variant_id" IS NOT DISTINCT FROM l."variant_id"
       AND winner."vendor_id" = l."vendor_id"
       AND winner."warehouse_id" = l."warehouse_id"
       AND winner.rn = 1
      LEFT JOIN "inventory" existing
        ON existing."product_id" = l."product_id"
       AND existing."variant_id" IS NOT DISTINCT FROM l."variant_id"
       AND existing."vendor_id" = l."vendor_id"
       AND existing."warehouse_id" = l."warehouse_id"
       AND existing."deleted_at" IS NULL
    `);

    await queryRunner.query(`
      UPDATE "inventory" target
      SET
        "quantity_on_hand" = target."quantity_on_hand" + source_totals."quantity_on_hand",
        "quantity_reserved" = target."quantity_reserved" + source_totals."quantity_reserved",
        "low_stock_threshold" = GREATEST(target."low_stock_threshold", source_totals."low_stock_threshold"),
        "last_restocked_at" = CASE
          WHEN target."last_restocked_at" IS NULL THEN source_totals."last_restocked_at"
          WHEN source_totals."last_restocked_at" IS NULL THEN target."last_restocked_at"
          ELSE GREATEST(target."last_restocked_at", source_totals."last_restocked_at")
        END,
        "updated_at" = now()
      FROM (
        SELECT
          m."target_id",
          SUM(source."quantity_on_hand")::integer AS "quantity_on_hand",
          SUM(source."quantity_reserved")::integer AS "quantity_reserved",
          MAX(source."low_stock_threshold")::integer AS "low_stock_threshold",
          MAX(source."last_restocked_at") AS "last_restocked_at"
        FROM "_inventory_warehouse_backfill" m
        INNER JOIN "inventory" source ON source."id" = m."source_id"
        WHERE m."source_id" <> m."target_id"
        GROUP BY m."target_id"
      ) source_totals
      WHERE target."id" = source_totals."target_id"
    `);

    await queryRunner.query(`
      UPDATE "inventory_reservations" r
      SET "inventory_id" = m."target_id", "updated_at" = now()
      FROM "_inventory_warehouse_backfill" m
      WHERE r."inventory_id" = m."source_id"
        AND m."source_id" <> m."target_id"
    `);

    await queryRunner.query(`
      UPDATE "inventory_movements" mv
      SET "inventory_id" = m."target_id"
      FROM "_inventory_warehouse_backfill" m
      WHERE mv."inventory_id" = m."source_id"
        AND m."source_id" <> m."target_id"
    `);

    await queryRunner.query(`
      UPDATE "inventory" source
      SET "deleted_at" = now(), "updated_at" = now()
      FROM "_inventory_warehouse_backfill" m
      WHERE source."id" = m."source_id"
        AND m."source_id" <> m."target_id"
    `);

    await queryRunner.query(`
      UPDATE "inventory" target
      SET "warehouse_id" = m."target_warehouse_id", "updated_at" = now()
      FROM "_inventory_warehouse_backfill" m
      WHERE target."id" = m."target_id"
        AND target."warehouse_id" IS NULL
        AND target."deleted_at" IS NULL
    `);

    await queryRunner.query(`
      WITH ranked AS (
        SELECT
          "id",
          row_number() OVER (
            PARTITION BY "vendor_id"
            ORDER BY "updated_at" DESC, "created_at" DESC, "id" DESC
          ) AS rn
        FROM "warehouses"
        WHERE "vendor_id" IS NOT NULL
          AND "is_default" = true
          AND "deleted_at" IS NULL
      )
      UPDATE "warehouses"
      SET "is_default" = false
      WHERE "id" IN (SELECT "id" FROM ranked WHERE rn > 1)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_warehouses_default_vendor_active"
      ON "warehouses" ("vendor_id")
      WHERE "is_default" = true AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_warehouses_default_vendor_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_warehouses_code_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_warehouse_vendor_permissions_active"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "warehouse_vendor_permissions"`);
    await queryRunner.query(`
      ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_code_key" UNIQUE ("code")
    `);
  }
}
