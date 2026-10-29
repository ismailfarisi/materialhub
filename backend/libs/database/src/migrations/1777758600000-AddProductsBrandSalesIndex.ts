import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddProductsBrandSalesIndex1777758600000 implements MigrationInterface {
  name = "AddProductsBrandSalesIndex1777758600000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX "idx_products_brand_sales_recent"
        ON "products" ("brand_id", "sales_count" DESC, "created_at" DESC)
        WHERE "deleted_at" IS NULL AND "status" = 'published'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_products_brand_sales_recent"`);
  }
}
