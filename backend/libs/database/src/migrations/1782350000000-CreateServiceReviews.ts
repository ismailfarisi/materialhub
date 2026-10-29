import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Phase 5 Task 2: NotificationType additions + `service_reviews` (spec §4.3, §7).
 *
 * Part 1 — `notification_type` gains 11 booking-service event values. The
 * Postgres enum type backing `notifications.type` /
 * `notification_preferences.notification_type` is the single shared
 * `notification_type` type (created in 1711500000000-InitialSchema,
 * `notification_channel` is a separate, unrelated type). Postgres 12+ allows
 * `ALTER TYPE ... ADD VALUE` inside a transaction as long as the new value
 * isn't *used* in the same transaction (we don't), so this needs no special
 * transaction handling — mirrors 1781800000000-AddCancelledShipmentStatus's
 * `ADD VALUE IF NOT EXISTS` precedent (one value per statement, irreversible
 * down migration since Postgres can't drop enum values without recreating
 * the type and rewriting dependent columns).
 *
 * Part 2 — `service_reviews`: a booking's post-service review, NOT the
 * product-coupled `reviews` table. One review per booking (booking_id
 * partial-unique WHERE deleted_at IS NULL). Task 7 (reviews) builds the
 * read/write endpoints on top of this scaffold. `status` gets its own
 * `service_reviews_status_enum` (same 4 values as product `review_status`)
 * rather than reusing that type, to keep booking-service's schema decoupled
 * from product-service's — mirrors how `bookings` minted its own
 * `bookings_status_enum` etc. instead of reusing order enums
 * (1782200000000-CreateBookings).
 */
export class CreateServiceReviews1782350000000 implements MigrationInterface {
  name = "CreateServiceReviews1782350000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Part 1: NotificationType additions ──
    await queryRunner.query(
      `ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'booking_confirmed'`,
    );
    await queryRunner.query(
      `ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'booking_reminder'`,
    );
    await queryRunner.query(
      `ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'booking_rescheduled'`,
    );
    await queryRunner.query(
      `ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'booking_cancelled'`,
    );
    await queryRunner.query(
      `ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'booking_no_show'`,
    );
    await queryRunner.query(
      `ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'booking_completed'`,
    );
    await queryRunner.query(
      `ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'booking_review_request'`,
    );
    await queryRunner.query(
      `ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'booking_payment_failed'`,
    );
    await queryRunner.query(
      `ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'vendor_new_booking'`,
    );
    await queryRunner.query(
      `ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'vendor_booking_cancelled'`,
    );
    await queryRunner.query(
      `ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'vendor_booking_conflict'`,
    );

    // ── Part 2: service_reviews ──
    await queryRunner.query(
      `CREATE TYPE "service_reviews_status_enum" AS ENUM ('pending','approved','rejected','flagged')`,
    );

    await queryRunner.query(`
      CREATE TABLE "service_reviews" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "booking_id" uuid NOT NULL,
        "customer_user_id" uuid NOT NULL,
        "vendor_id" uuid NOT NULL,
        "staff_member_id" uuid NOT NULL,
        "rating" smallint NOT NULL,
        "title" varchar(255),
        "body" text,
        "media_urls" jsonb NOT NULL DEFAULT '[]',
        "status" "service_reviews_status_enum" NOT NULL DEFAULT 'pending',
        "vendor_reply" text,
        "is_verified" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "fk_service_reviews_booking" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id"),
        CONSTRAINT "fk_service_reviews_customer" FOREIGN KEY ("customer_user_id") REFERENCES "users"("id"),
        CONSTRAINT "fk_service_reviews_vendor" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id"),
        CONSTRAINT "fk_service_reviews_staff" FOREIGN KEY ("staff_member_id") REFERENCES "staff_members"("id"),
        CONSTRAINT "chk_service_reviews_rating" CHECK ("rating" >= 1 AND "rating" <= 5)
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_service_reviews_booking" ON "service_reviews" ("booking_id") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_service_reviews_vendor" ON "service_reviews" ("vendor_id") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_service_reviews_staff" ON "service_reviews" ("staff_member_id") WHERE "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "service_reviews"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "service_reviews_status_enum"`);

    // NotificationType additions are NOT reverted: Postgres cannot remove enum
    // values without recreating the type and rewriting every dependent column
    // (mirrors 1781800000000-AddCancelledShipmentStatus).
  }
}
