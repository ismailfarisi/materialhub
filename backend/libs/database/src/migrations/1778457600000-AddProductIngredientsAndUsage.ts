import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddProductIngredientsAndUsage1778457600000 implements MigrationInterface {
  name = "AddProductIngredientsAndUsage1778457600000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
        ADD COLUMN "ingredients" text NULL,
        ADD COLUMN "usage_instructions" text NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "product_translations"
        ADD COLUMN "ingredients" text NULL,
        ADD COLUMN "usage_instructions" text NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_translations"
        DROP COLUMN IF EXISTS "usage_instructions",
        DROP COLUMN IF EXISTS "ingredients"
    `);

    await queryRunner.query(`
      ALTER TABLE "products"
        DROP COLUMN IF EXISTS "usage_instructions",
        DROP COLUMN IF EXISTS "ingredients"
    `);
  }
}
