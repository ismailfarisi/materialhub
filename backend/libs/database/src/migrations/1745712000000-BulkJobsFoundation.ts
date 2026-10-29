import type { MigrationInterface, QueryRunner } from "typeorm";

export class BulkJobsFoundation1745712000000 implements MigrationInterface {
  name = "BulkJobsFoundation1745712000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Enums ────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "bulk_job_type_enum" AS ENUM ('inventory_update', 'catalog_import')
    `);
    await queryRunner.query(`
      CREATE TYPE "bulk_job_status_enum" AS ENUM (
        'pending_upload', 'queued', 'running', 'completed',
        'completed_with_errors', 'failed', 'cancelled'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "bulk_job_strictness_enum" AS ENUM ('all_or_nothing', 'best_effort')
    `);
    await queryRunner.query(`
      CREATE TYPE "bulk_job_file_format_enum" AS ENUM ('csv', 'xlsx')
    `);
    await queryRunner.query(`
      CREATE TYPE "bulk_image_task_status_enum" AS ENUM (
        'queued', 'running', 'succeeded', 'failed', 'retrying'
      )
    `);

    // ── bulk_import_jobs ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "bulk_import_jobs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "job_type" "bulk_job_type_enum" NOT NULL,
        "status" "bulk_job_status_enum" NOT NULL DEFAULT 'pending_upload',
        "strictness" "bulk_job_strictness_enum" NOT NULL,
        "vendor_id" uuid NULL,
        "initiated_by_user_id" uuid NOT NULL,
        "initiated_by_role" "user_role" NOT NULL,
        "file_s3_key" varchar(512) NOT NULL,
        "file_name" varchar(256) NOT NULL,
        "file_size_bytes" integer NOT NULL,
        "file_format" "bulk_job_file_format_enum" NOT NULL,
        "total_rows" integer NULL,
        "processed_rows" integer NOT NULL DEFAULT 0,
        "succeeded_rows" integer NOT NULL DEFAULT 0,
        "skipped_rows" integer NOT NULL DEFAULT 0,
        "images_total" integer NOT NULL DEFAULT 0,
        "images_processed" integer NOT NULL DEFAULT 0,
        "images_failed" integer NOT NULL DEFAULT 0,
        "error_report_s3_key" varchar(512) NULL,
        "summary" jsonb NULL,
        "queued_at" timestamptz NULL,
        "started_at" timestamptz NULL,
        "completed_at" timestamptz NULL,
        "cancel_requested_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL,
        CONSTRAINT "PK_bulk_import_jobs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_bulk_import_jobs_vendor"
          FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_bulk_import_jobs_user"
          FOREIGN KEY ("initiated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_bulk_import_jobs_vendor_created"
      ON "bulk_import_jobs" ("vendor_id", "created_at" DESC)
      WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_bulk_import_jobs_status_active"
      ON "bulk_import_jobs" ("status")
      WHERE "status" IN ('queued', 'running') AND "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_bulk_import_jobs_user_created"
      ON "bulk_import_jobs" ("initiated_by_user_id", "created_at" DESC)
      WHERE "deleted_at" IS NULL
    `);

    // ── bulk_import_job_row_errors ───────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "bulk_import_job_row_errors" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "job_id" uuid NOT NULL,
        "row_number" integer NOT NULL,
        "sheet_name" varchar(64) NULL,
        "error_code" varchar(64) NOT NULL,
        "error_message" text NOT NULL,
        "field" varchar(64) NULL,
        "row_snapshot" jsonb NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bulk_import_job_row_errors" PRIMARY KEY ("id"),
        CONSTRAINT "FK_bulk_row_errors_job"
          FOREIGN KEY ("job_id") REFERENCES "bulk_import_jobs"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_bulk_row_errors_job_row"
      ON "bulk_import_job_row_errors" ("job_id", "row_number")
    `);

    // ── bulk_import_job_row_changes ──────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "bulk_import_job_row_changes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "job_id" uuid NOT NULL,
        "row_number" integer NOT NULL,
        "entity_type" varchar(32) NOT NULL,
        "entity_id" uuid NOT NULL,
        "field" varchar(64) NOT NULL,
        "old_value" jsonb NULL,
        "new_value" jsonb NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bulk_import_job_row_changes" PRIMARY KEY ("id"),
        CONSTRAINT "FK_bulk_row_changes_job"
          FOREIGN KEY ("job_id") REFERENCES "bulk_import_jobs"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_bulk_row_changes_job" ON "bulk_import_job_row_changes" ("job_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_bulk_row_changes_entity"
      ON "bulk_import_job_row_changes" ("entity_type", "entity_id", "created_at" DESC)
    `);

    // ── bulk_import_job_image_tasks ──────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "bulk_import_job_image_tasks" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "job_id" uuid NOT NULL,
        "row_number" integer NOT NULL,
        "product_id" uuid NOT NULL,
        "variant_id" uuid NULL,
        "source_url" text NOT NULL,
        "sort_order" smallint NOT NULL DEFAULT 0,
        "status" "bulk_image_task_status_enum" NOT NULL DEFAULT 'queued',
        "attempt_count" smallint NOT NULL DEFAULT 0,
        "last_error" text NULL,
        "product_image_id" uuid NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bulk_import_job_image_tasks" PRIMARY KEY ("id"),
        CONSTRAINT "FK_bulk_image_tasks_job"
          FOREIGN KEY ("job_id") REFERENCES "bulk_import_jobs"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_bulk_image_tasks_product"
          FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_bulk_image_tasks_variant"
          FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_bulk_image_tasks_product_image"
          FOREIGN KEY ("product_image_id") REFERENCES "product_images"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_bulk_image_tasks_job_status"
      ON "bulk_import_job_image_tasks" ("job_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_bulk_image_tasks_claim"
      ON "bulk_import_job_image_tasks" ("status")
      WHERE "status" IN ('queued', 'retrying')
    `);

    // ── external_id columns on products and product_variants ─────────────
    await queryRunner.query(`
      ALTER TABLE "products" ADD COLUMN "external_id" varchar(128) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "product_variants" ADD COLUMN "external_id" varchar(128) NULL
    `);

    // ── New partial unique indexes for upsert keys ───────────────────────
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_products_vendor_external_id"
      ON "products" ("vendor_id", "external_id")
      WHERE "external_id" IS NOT NULL AND "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_products_vendor_sku"
      ON "products" ("vendor_id", "sku")
      WHERE "sku" IS NOT NULL AND "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_product_variants_product_external_id"
      ON "product_variants" ("product_id", "external_id")
      WHERE "external_id" IS NOT NULL AND "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_product_variants_product_sku"
      ON "product_variants" ("product_id", "sku")
      WHERE "sku" IS NOT NULL AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_product_variants_product_sku"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_product_variants_product_external_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_products_vendor_sku"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_products_vendor_external_id"`);
    await queryRunner.query(`ALTER TABLE "product_variants" DROP COLUMN IF EXISTS "external_id"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "external_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bulk_import_job_image_tasks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bulk_import_job_row_changes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bulk_import_job_row_errors"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bulk_import_jobs"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "bulk_image_task_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "bulk_job_file_format_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "bulk_job_strictness_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "bulk_job_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "bulk_job_type_enum"`);
  }
}
