import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateBookingScheduling1782100000000 implements MigrationInterface {
  name = "CreateBookingScheduling1782100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The capacity-ledger EXCLUDE constraint mixes an equality predicate on a
    // uuid (staff_member_id) with a range-overlap predicate — a GiST index over
    // both needs the btree_gist extension for the uuid equality operator class.
    await queryRunner.query("CREATE EXTENSION IF NOT EXISTS btree_gist");

    await queryRunner.query(
      `CREATE TYPE "staff_engagements_status_enum" AS ENUM ('held','confirmed','released','cancelled','conflicted')`,
    );
    await queryRunner.query(
      `CREATE TYPE "staff_engagements_kind_enum" AS ENUM ('marketplace_booking','walk_in','phone','external_import','manual_block','break')`,
    );

    await queryRunner.query(`
      CREATE TABLE "vendor_locations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "vendor_id" uuid NOT NULL,
        "name" varchar(255) NOT NULL,
        "address" jsonb,
        "lat" numeric(10,7),
        "lng" numeric(10,7),
        "area_id" uuid,
        "timezone" varchar(64) NOT NULL DEFAULT 'Asia/Dubai',
        "is_active" boolean NOT NULL DEFAULT true,
        "settings" jsonb NOT NULL DEFAULT '{}',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "fk_vendor_locations_vendor" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "service_areas" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "vendor_id" uuid NOT NULL,
        "area_id" uuid NOT NULL,
        "travel_buffer_minutes" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "fk_service_areas_vendor" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "staff_members" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "vendor_id" uuid NOT NULL,
        "user_id" uuid,
        "name" varchar(255) NOT NULL,
        "avatar_url" text,
        "bio" text,
        "is_active" boolean NOT NULL DEFAULT true,
        "rating" numeric(3,2) NOT NULL DEFAULT 0,
        "rating_count" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "fk_staff_members_vendor" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id"),
        CONSTRAINT "fk_staff_members_user" FOREIGN KEY ("user_id") REFERENCES "users"("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "staff_locations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "staff_member_id" uuid NOT NULL,
        "vendor_location_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "fk_staff_locations_staff" FOREIGN KEY ("staff_member_id") REFERENCES "staff_members"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_staff_locations_location" FOREIGN KEY ("vendor_location_id") REFERENCES "vendor_locations"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "staff_services" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "staff_member_id" uuid NOT NULL,
        "service_offering_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "fk_staff_services_staff" FOREIGN KEY ("staff_member_id") REFERENCES "staff_members"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_staff_services_offering" FOREIGN KEY ("service_offering_id") REFERENCES "service_offerings"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "staff_working_hours" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "staff_member_id" uuid NOT NULL,
        "location_id" uuid,
        "day_of_week" smallint NOT NULL,
        "start_time" time NOT NULL,
        "end_time" time NOT NULL,
        "effective_from" date,
        "effective_to" date,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "fk_swh_staff" FOREIGN KEY ("staff_member_id") REFERENCES "staff_members"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_swh_location" FOREIGN KEY ("location_id") REFERENCES "vendor_locations"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "staff_time_off" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "staff_member_id" uuid NOT NULL,
        "starts_at" timestamptz NOT NULL,
        "ends_at" timestamptz NOT NULL,
        "reason" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "fk_sto_staff" FOREIGN KEY ("staff_member_id") REFERENCES "staff_members"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "location_memberships" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "vendor_location_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "role" varchar(32) NOT NULL,
        "permissions" jsonb NOT NULL DEFAULT '[]',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "fk_lm_location" FOREIGN KEY ("vendor_location_id") REFERENCES "vendor_locations"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_lm_user" FOREIGN KEY ("user_id") REFERENCES "users"("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "staff_engagements" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "staff_member_id" uuid NOT NULL,
        "vendor_id" uuid NOT NULL,
        "starts_at" timestamptz NOT NULL,
        "ends_at" timestamptz NOT NULL,
        -- DERIVED, never written by the application. The GiST EXCLUDE below
        -- reads ONLY slot_range, while the availability engine, the iCal feed
        -- and both (staff|vendor, starts_at) indexes read ONLY starts_at/
        -- ends_at. Storing all three independently means any writer that
        -- updates the times without recomputing the range leaves the EXCLUDE
        -- passing against a STALE range — i.e. double-booking protection
        -- silently off while the booking shows the new time. GENERATED ALWAYS
        -- makes that class of bug unrepresentable: Postgres recomputes the
        -- range on every INSERT/UPDATE and rejects any attempt to write it.
        -- tstzrange(timestamptz, timestamptz, text) is IMMUTABLE, so it is
        -- legal in a STORED generated column, and a stored generated column
        -- is indexable / usable in an EXCLUDE constraint.
        "slot_range" tstzrange NOT NULL
          GENERATED ALWAYS AS (tstzrange("starts_at", "ends_at", '[)')) STORED,
        "status" "staff_engagements_status_enum" NOT NULL DEFAULT 'held',
        "kind" "staff_engagements_kind_enum" NOT NULL,
        "external_source" varchar(128),
        "external_ref" varchar(255),
        "created_by" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_engagement_staff" FOREIGN KEY ("staff_member_id") REFERENCES "staff_members"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_engagement_vendor" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id")
      )
    `);

    // ── Anti-double-booking guarantee: a staff member cannot have two
    // overlapping engagements while either is held or confirmed. `released`,
    // `cancelled`, and `conflicted` sit OUTSIDE the predicate — a conflicted
    // iCal import (Phase 6) is therefore always insertable and surfaced.
    await queryRunner.query(`
      ALTER TABLE "staff_engagements" ADD CONSTRAINT "no_double_book"
        EXCLUDE USING gist (staff_member_id WITH =, slot_range WITH &&)
        WHERE (status IN ('held','confirmed'))
    `);

    // ── Indexes ──
    await queryRunner.query(
      `CREATE INDEX "idx_vendor_locations_vendor" ON "vendor_locations" ("vendor_id") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_service_areas_vendor" ON "service_areas" ("vendor_id") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_service_areas_vendor_area" ON "service_areas" ("vendor_id","area_id") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_staff_members_vendor" ON "staff_members" ("vendor_id") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_staff_locations_staff" ON "staff_locations" ("staff_member_id") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_staff_locations_staff_location" ON "staff_locations" ("staff_member_id","vendor_location_id") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_staff_services_staff" ON "staff_services" ("staff_member_id") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_staff_services_staff_offering" ON "staff_services" ("staff_member_id","service_offering_id") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_swh_staff" ON "staff_working_hours" ("staff_member_id") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sto_staff" ON "staff_time_off" ("staff_member_id") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_lm_location" ON "location_memberships" ("vendor_location_id") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_lm_location_user" ON "location_memberships" ("vendor_location_id","user_id") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_engagement_staff_start" ON "staff_engagements" ("staff_member_id","starts_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_engagement_vendor_start" ON "staff_engagements" ("vendor_id","starts_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "staff_engagements"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "location_memberships"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "staff_time_off"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "staff_working_hours"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "staff_services"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "staff_locations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "staff_members"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "service_areas"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "vendor_locations"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "staff_engagements_kind_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "staff_engagements_status_enum"`);
  }
}
