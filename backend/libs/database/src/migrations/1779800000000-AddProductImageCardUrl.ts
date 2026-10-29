import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddProductImageCardUrl1779800000000 implements MigrationInterface {
  name = "AddProductImageCardUrl1779800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_images"
        ADD COLUMN "card_url" varchar(1024) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_images"
        DROP COLUMN IF EXISTS "card_url"
    `);
  }
}
