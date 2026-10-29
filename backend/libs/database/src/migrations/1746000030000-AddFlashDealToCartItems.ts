import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddFlashDealToCartItems1746000030000 implements MigrationInterface {
  name = "AddFlashDealToCartItems1746000030000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "cart_items"
        ADD COLUMN "flash_deal_id" uuid REFERENCES "flash_deals"("id") ON DELETE SET NULL,
        ADD COLUMN "original_unit_price" integer
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_cart_items_flash_deal"
        ON "cart_items"("flash_deal_id")
        WHERE "flash_deal_id" IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_cart_items_flash_deal"`);
    await queryRunner.query(`
      ALTER TABLE "cart_items"
        DROP COLUMN IF EXISTS "original_unit_price",
        DROP COLUMN IF EXISTS "flash_deal_id"
    `);
  }
}
