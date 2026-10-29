import type { MigrationInterface, QueryRunner } from "typeorm";

export class WidenProductMetaColumns1780000000000 implements MigrationInterface {
  name = "WidenProductMetaColumns1780000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
        ALTER COLUMN "meta_description" TYPE text,
        ALTER COLUMN "meta_keywords" TYPE text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
        ALTER COLUMN "meta_description" TYPE varchar(500),
        ALTER COLUMN "meta_keywords" TYPE varchar(500)
    `);
  }
}
