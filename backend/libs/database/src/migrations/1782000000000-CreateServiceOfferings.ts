import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateServiceOfferings1782000000000 implements MigrationInterface {
  name = "CreateServiceOfferings1782000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "service_offerings_location_mode_enum" AS ENUM ('at_premises','home_visit','either')`,
    );
    await queryRunner.query(
      `CREATE TYPE "service_offerings_payment_mode_enum" AS ENUM ('prepay','deposit','pay_at_venue')`,
    );
    await queryRunner.query(
      `CREATE TYPE "service_offerings_deposit_type_enum" AS ENUM ('percent','fixed','none')`,
    );
    await queryRunner.query(
      `CREATE TYPE "service_offerings_cancellation_refund_policy_enum" AS ENUM ('full','deposit_forfeit','percent')`,
    );
    await queryRunner.query(
      `CREATE TYPE "service_offerings_status_enum" AS ENUM ('draft','published','paused','archived')`,
    );

    await queryRunner.query(`
      CREATE TABLE "service_offerings" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "vendor_id" uuid NOT NULL,
        "category_id" uuid,
        "slug" varchar(255) NOT NULL,
        "name" varchar(255) NOT NULL,
        "description" text,
        "media_urls" jsonb NOT NULL DEFAULT '[]',
        "duration_minutes" integer NOT NULL,
        "buffer_before_minutes" integer NOT NULL DEFAULT 0,
        "buffer_after_minutes" integer NOT NULL DEFAULT 0,
        "slot_step_minutes" integer NOT NULL DEFAULT 15,
        "location_mode" "service_offerings_location_mode_enum" NOT NULL DEFAULT 'at_premises',
        "payment_mode" "service_offerings_payment_mode_enum" NOT NULL DEFAULT 'pay_at_venue',
        "price_fils" integer NOT NULL,
        "deposit_type" "service_offerings_deposit_type_enum" NOT NULL DEFAULT 'none',
        "deposit_value" integer NOT NULL DEFAULT 0,
        "vat_rate" numeric(5,2) NOT NULL DEFAULT 5,
        "min_notice_minutes" integer NOT NULL DEFAULT 0,
        "max_advance_days" integer NOT NULL DEFAULT 60,
        "cancellation_window_hours" integer NOT NULL DEFAULT 24,
        "cancellation_refund_policy" "service_offerings_cancellation_refund_policy_enum" NOT NULL DEFAULT 'full',
        "cancellation_penalty_percent" integer NOT NULL DEFAULT 100,
        "reschedule_window_hours" integer NOT NULL DEFAULT 24,
        "status" "service_offerings_status_enum" NOT NULL DEFAULT 'draft',
        "auto_approve" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "fk_service_offerings_vendor" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "service_offering_translations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "offering_id" uuid NOT NULL,
        "locale" varchar(8) NOT NULL,
        "name" varchar(255) NOT NULL,
        "description" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "fk_sot_offering" FOREIGN KEY ("offering_id") REFERENCES "service_offerings"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_service_offerings_vendor" ON "service_offerings" ("vendor_id") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_service_offerings_slug" ON "service_offerings" ("slug") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_service_offerings_status" ON "service_offerings" ("status") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_sot_offering_locale" ON "service_offering_translations" ("offering_id","locale") WHERE "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "service_offering_translations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "service_offerings"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "service_offerings_status_enum"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "service_offerings_cancellation_refund_policy_enum"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "service_offerings_deposit_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "service_offerings_payment_mode_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "service_offerings_location_mode_enum"`);
  }
}
