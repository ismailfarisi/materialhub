import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddProductEditorial1778544200000 implements MigrationInterface {
  name = "AddProductEditorial1778544200000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
        ADD COLUMN "editorial" jsonb NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
        DROP COLUMN IF EXISTS "editorial"
    `);
  }
}
