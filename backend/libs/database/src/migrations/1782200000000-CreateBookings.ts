import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The booking transaction (Phase 4 Task 1): `bookings` — the rich row 1:1 with a
 * `staff_engagement`, snapshotting price/vat/deposit/policy/commission at booking
 * time (spec §4.3, §5.3) — and `booking_status_history`, mirroring
 * `order_status_history`.
 *
 * Also extends the shared `payments` table so a payment can attach to a booking
 * instead of an order: `order_id` becomes nullable, `booking_id` is added, and a
 * CHECK enforces exactly one is set — mirrors the offer_id/bid_id pattern from
 * 1781300000000-EscrowLinkNullableOffer. All existing payment rows already have
 * order_id set (booking_id defaults NULL), so this is backward compatible with
 * the live order flow.
 */
export class CreateBookings1782200000000 implements MigrationInterface {
  name = "CreateBookings1782200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "bookings_status_enum" AS ENUM ('pending_payment','confirmed','rescheduled','cancelled','completed','no_show','expired')`,
    );
    await queryRunner.query(
      `CREATE TYPE "bookings_deposit_type_enum" AS ENUM ('percent','fixed','none')`,
    );
    await queryRunner.query(
      `CREATE TYPE "bookings_cancellation_refund_policy_enum" AS ENUM ('full','deposit_forfeit','percent')`,
    );
    await queryRunner.query(
      `CREATE TYPE "bookings_payment_mode_enum" AS ENUM ('prepay','deposit','pay_at_venue')`,
    );

    await queryRunner.query(`
      CREATE TABLE "bookings" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "booking_number" varchar(30) NOT NULL,
        "customer_user_id" uuid NOT NULL,
        "vendor_id" uuid NOT NULL,
        "location_id" uuid,
        "customer_address" jsonb,
        "staff_member_id" uuid NOT NULL,
        "engagement_id" uuid NOT NULL,
        "service_offering_id" uuid NOT NULL,
        "service_name" varchar(255) NOT NULL,
        "duration_minutes" integer NOT NULL,
        "price_fils" integer NOT NULL,
        "vat_fils" integer NOT NULL DEFAULT 0,
        "deposit_fils" integer NOT NULL DEFAULT 0,
        "deposit_type" "bookings_deposit_type_enum" NOT NULL DEFAULT 'none',
        "cancellation_window_hours" integer NOT NULL,
        "cancellation_refund_policy" "bookings_cancellation_refund_policy_enum" NOT NULL DEFAULT 'full',
        "cancellation_penalty_percent" integer NOT NULL DEFAULT 100,
        "reschedule_window_hours" integer NOT NULL,
        "commission_rate" numeric(8,4) NOT NULL,
        "commission_fils" integer NOT NULL DEFAULT 0,
        "starts_at" timestamptz NOT NULL,
        "ends_at" timestamptz NOT NULL,
        "status" "bookings_status_enum" NOT NULL DEFAULT 'pending_payment',
        "source" varchar(32) NOT NULL DEFAULT 'marketplace',
        "payment_mode" "bookings_payment_mode_enum" NOT NULL,
        "amount_paid_fils" integer NOT NULL DEFAULT 0,
        "balance_due_fils" integer NOT NULL DEFAULT 0,
        "paid_at_venue" boolean NOT NULL DEFAULT false,
        "payment_id" uuid,
        "escrow_hold_id" uuid,
        "notes" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "fk_bookings_customer" FOREIGN KEY ("customer_user_id") REFERENCES "users"("id"),
        CONSTRAINT "fk_bookings_vendor" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id"),
        CONSTRAINT "fk_bookings_location" FOREIGN KEY ("location_id") REFERENCES "vendor_locations"("id"),
        CONSTRAINT "fk_bookings_staff" FOREIGN KEY ("staff_member_id") REFERENCES "staff_members"("id"),
        CONSTRAINT "fk_bookings_engagement" FOREIGN KEY ("engagement_id") REFERENCES "staff_engagements"("id"),
        CONSTRAINT "fk_bookings_offering" FOREIGN KEY ("service_offering_id") REFERENCES "service_offerings"("id"),
        CONSTRAINT "fk_bookings_payment" FOREIGN KEY ("payment_id") REFERENCES "payments"("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "booking_status_history" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "booking_id" uuid NOT NULL,
        "from_status" varchar(50),
        "to_status" varchar(50) NOT NULL,
        "actor_id" uuid,
        "actor_role" varchar(50),
        "reason" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_booking_status_history_booking" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_booking_status_history_actor" FOREIGN KEY ("actor_id") REFERENCES "users"("id")
      )
    `);

    // ── Indexes ──
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_bookings_number" ON "bookings" ("booking_number") WHERE "deleted_at" IS NULL`,
    );
    // 1:1 with staff_engagements.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_bookings_engagement" ON "bookings" ("engagement_id") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_bookings_customer" ON "bookings" ("customer_user_id") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_bookings_vendor_starts" ON "bookings" ("vendor_id","starts_at") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_bookings_staff_starts" ON "bookings" ("staff_member_id","starts_at") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_bookings_status" ON "bookings" ("status") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_booking_status_history_booking" ON "booking_status_history" ("booking_id","created_at")`,
    );

    // ── payments: attach to a booking instead of an order ──
    await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "order_id" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "payments" ADD COLUMN "booking_id" uuid`);
    // NOT VALID — `payments` is a LIVE table that grows with every order, and
    // the migrate service runs on deploy. A plain ADD CONSTRAINT takes ACCESS
    // EXCLUSIVE (CHECK) / SHARE ROW EXCLUSIVE (FK) and scans every existing
    // row to validate it, blocking the entire payment path for the duration.
    // NOT VALID takes the lock only briefly and skips the scan; the row scan
    // is deferred to VALIDATE CONSTRAINT (SHARE UPDATE EXCLUSIVE — concurrent
    // reads AND writes keep running) in the trailing
    // BookingLiveTableConstraintsConcurrent migration.
    //
    // Both constraints are enforced for NEW/UPDATED rows immediately even
    // while NOT VALID, so there is no correctness window. Existing rows all
    // have order_id NOT NULL and booking_id NULL (just added), so they
    // already satisfy the CHECK and the deferred scan cannot fail.
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "fk_payments_booking" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") NOT VALID`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "chk_payments_order_or_booking" CHECK (num_nonnulls("order_id","booking_id") = 1) NOT VALID`,
    );
    // NOTE: `idx_payments_booking` is built CONCURRENTLY in the trailing
    // BookingLiveTableConstraintsConcurrent migration — a plain CREATE INDEX
    // here would take SHARE and block every write to `payments` for the whole
    // index build.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_payments_booking"`);
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "chk_payments_order_or_booking"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "fk_payments_booking"`,
    );
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "booking_id"`);
    await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "order_id" SET NOT NULL`);

    await queryRunner.query(`DROP TABLE IF EXISTS "booking_status_history"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bookings"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "bookings_payment_mode_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "bookings_cancellation_refund_policy_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "bookings_deposit_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "bookings_status_enum"`);
  }
}
