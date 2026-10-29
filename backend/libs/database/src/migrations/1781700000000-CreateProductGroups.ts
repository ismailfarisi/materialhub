import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateProductGroups1781700000000 implements MigrationInterface {
  name = "CreateProductGroups1781700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "attributes"
      ADD COLUMN "is_groupable" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      CREATE TYPE "product_groups_listing_mode_enum" AS ENUM ('collapsed', 'individual')
    `);

    await queryRunner.query(`
      CREATE TABLE "product_groups" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "vendor_id" uuid NOT NULL,
        "category_id" uuid,
        "name" varchar(255) NOT NULL,
        "grouping_attribute_id" uuid NOT NULL,
        "listing_mode" "product_groups_listing_mode_enum" NOT NULL DEFAULT 'collapsed',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "fk_product_groups_vendor" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id"),
        CONSTRAINT "fk_product_groups_attribute" FOREIGN KEY ("grouping_attribute_id") REFERENCES "attributes"("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "product_group_members" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "group_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "attribute_value_id" uuid NOT NULL,
        "is_primary" boolean NOT NULL DEFAULT false,
        "sort_order" smallint NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "fk_pgm_group" FOREIGN KEY ("group_id") REFERENCES "product_groups"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_pgm_product" FOREIGN KEY ("product_id") REFERENCES "products"("id"),
        CONSTRAINT "fk_pgm_attribute_value" FOREIGN KEY ("attribute_value_id") REFERENCES "attribute_values"("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_product_groups_vendor" ON "product_groups" ("vendor_id") WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_pgm_group_product" ON "product_group_members" ("group_id", "product_id") WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_pgm_group_value" ON "product_group_members" ("group_id", "attribute_value_id") WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_pgm_group_primary" ON "product_group_members" ("group_id") WHERE "is_primary" = true AND "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_pgm_product" ON "product_group_members" ("product_id") WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "product_group_members"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product_groups"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "product_groups_listing_mode_enum"`);
    await queryRunner.query(`ALTER TABLE "attributes" DROP COLUMN IF EXISTS "is_groupable"`);
  }
}
