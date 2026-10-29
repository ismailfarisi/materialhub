import type { MigrationInterface, QueryRunner } from "typeorm";

export class BulkImportMode1782100000000 implements MigrationInterface {
  name = "BulkImportMode1782100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "bulk_import_mode_enum" AS ENUM ('upsert', 'update')
    `);
    await queryRunner.query(`
      ALTER TABLE "bulk_import_jobs"
        ADD COLUMN "import_mode" "bulk_import_mode_enum" NOT NULL DEFAULT 'upsert'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bulk_import_jobs" DROP COLUMN IF EXISTS "import_mode"
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS "bulk_import_mode_enum"`);
  }
}
