import type { MigrationInterface, QueryRunner } from "typeorm";

export class FlashDealBulkSupport1777921000000 implements MigrationInterface {
  name = "FlashDealBulkSupport1777921000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Postgres requires ALTER TYPE ADD VALUE outside of any transaction that created the type.
    // The enum was created in migration 1745712000000, so we can add values here.
    // IF NOT EXISTS is idempotent and non-locking on Postgres ≥ 12.
    await queryRunner.query(
      `ALTER TYPE "bulk_job_type_enum" ADD VALUE IF NOT EXISTS 'flash_deal_import'`,
    );
    await queryRunner.query(
      `ALTER TYPE "bulk_job_type_enum" ADD VALUE IF NOT EXISTS 'flash_deal_delete'`,
    );

    await queryRunner.query(`
      ALTER TABLE "bulk_import_jobs"
        ADD COLUMN "reverted_at" timestamptz NULL,
        ADD COLUMN "reverted_by_user_id" uuid NULL REFERENCES "users"("id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bulk_import_jobs"
        DROP COLUMN IF EXISTS "reverted_by_user_id",
        DROP COLUMN IF EXISTS "reverted_at"
    `);
    // Postgres cannot drop enum values without recreating the type. Acceptable —
    // these values are harmless if left in place after a rollback.
  }
}
