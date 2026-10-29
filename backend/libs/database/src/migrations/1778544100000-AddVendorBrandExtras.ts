import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddVendorBrandExtras1778544100000 implements MigrationInterface {
  name = "AddVendorBrandExtras1778544100000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vendors"
        ADD COLUMN "founded_year" smallint NULL,
        ADD COLUMN "story" text NULL,
        ADD COLUMN "response_time_hours" smallint NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vendors"
        DROP COLUMN IF EXISTS "response_time_hours",
        DROP COLUMN IF EXISTS "story",
        DROP COLUMN IF EXISTS "founded_year"
    `);
  }
}
