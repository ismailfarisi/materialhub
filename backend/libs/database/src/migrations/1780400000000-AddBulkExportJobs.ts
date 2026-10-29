import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddBulkExportJobs1780400000000 implements MigrationInterface {
  name = "AddBulkExportJobs1780400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "bulk_export_job_type_enum" AS ENUM ('product_export');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "bulk_export_job_status_enum" AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "bulk_export_file_format_enum" AS ENUM ('csv', 'xlsx');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "product_export_preset_enum" AS ENUM ('catalog_overview', 'pricing', 'inventory', 'media_health', 'seo', 'custom');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "bulk_export_jobs" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "job_type" "bulk_export_job_type_enum" NOT NULL,
        "status" "bulk_export_job_status_enum" NOT NULL DEFAULT 'queued',
        "vendor_id" uuid,
        "initiated_by_user_id" uuid NOT NULL,
        "initiated_by_role" "user_role" NOT NULL,
        "format" "bulk_export_file_format_enum" NOT NULL,
        "preset" "product_export_preset_enum" NOT NULL,
        "field_groups" jsonb NOT NULL,
        "fields" jsonb NOT NULL,
        "filters" jsonb NOT NULL,
        "file_s3_key" varchar(512),
        "file_name" varchar(256) NOT NULL,
        "file_size_bytes" integer,
        "row_counts" jsonb,
        "error_message" text,
        "expires_at" timestamptz NOT NULL,
        "queued_at" timestamptz,
        "started_at" timestamptz,
        "completed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_bulk_export_jobs" PRIMARY KEY ("id"),
        CONSTRAINT "fk_bulk_export_jobs_vendor" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_bulk_export_jobs_user" FOREIGN KEY ("initiated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_bulk_export_jobs_vendor_created"
      ON "bulk_export_jobs" ("vendor_id", "created_at" DESC)
      WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_bulk_export_jobs_user_created"
      ON "bulk_export_jobs" ("initiated_by_user_id", "created_at" DESC)
      WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_bulk_export_jobs_status"
      ON "bulk_export_jobs" ("status", "created_at" DESC)
      WHERE "deleted_at" IS NULL AND "status" IN ('queued', 'running')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_bulk_export_jobs_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_bulk_export_jobs_user_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_bulk_export_jobs_vendor_created"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bulk_export_jobs"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "product_export_preset_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "bulk_export_file_format_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "bulk_export_job_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "bulk_export_job_type_enum"`);
  }
}
