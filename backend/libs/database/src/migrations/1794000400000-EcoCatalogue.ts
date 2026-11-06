import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Eco catalogue (workstream 4): vendor "plastic-ban ready" declarations with
 * an optional private certificate and an admin review status.
 *
 * The compliance attributes themselves (material composition, recyclable,
 * compostable, plastic-free, forest certification, bag thickness) are rows in
 * the existing `attributes` / `attribute_values` / `category_attributes`
 * tables and are created by the seed, so they need no DDL here.
 */
export class EcoCatalogue1794000400000 implements MigrationInterface {
  name = "EcoCatalogue1794000400000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."eco_declaration_status_enum" AS ENUM('pending', 'approved', 'rejected', 'withdrawn')`,
    );
    await queryRunner.query(
      `CREATE TABLE "product_eco_declarations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "product_id" uuid NOT NULL, "vendor_id" uuid NOT NULL, "status" "public"."eco_declaration_status_enum" NOT NULL DEFAULT 'pending', "statement" text, "certificate_key" character varying(1024), "certificate_filename" character varying(255), "declared_by" uuid, "submitted_at" TIMESTAMP WITH TIME ZONE NOT NULL, "reviewed_by" uuid, "reviewed_at" TIMESTAMP WITH TIME ZONE, "rejection_reason" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "REL_2cec723b5b1c7aadf0875b490f" UNIQUE ("product_id"), CONSTRAINT "PK_2bf76caa716937ea8e6379f00e2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_eco_declarations_vendor" ON "product_eco_declarations" ("vendor_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_eco_declarations_status" ON "product_eco_declarations" ("status", "submitted_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "product_eco_declarations" ADD CONSTRAINT "FK_2cec723b5b1c7aadf0875b490ff" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_eco_declarations" ADD CONSTRAINT "FK_6e36f8fa99881b9548f177d3d5e" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_eco_declarations" DROP CONSTRAINT "FK_6e36f8fa99881b9548f177d3d5e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_eco_declarations" DROP CONSTRAINT "FK_2cec723b5b1c7aadf0875b490ff"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_product_eco_declarations_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_product_eco_declarations_vendor"`);
    await queryRunner.query(`DROP TABLE "product_eco_declarations"`);
    await queryRunner.query(`DROP TYPE "public"."eco_declaration_status_enum"`);
  }
}
