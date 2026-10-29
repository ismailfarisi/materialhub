import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Commission accrual on booking completion (Phase 4 Task 9; spec §5.3
 * "commission snapshotted at booking, accrued into the vendor_payout pipeline
 * on completed").
 *
 * `commissions` previously required an order/vendor_order/order_item triple
 * (NOT NULL) — a booking has none of those. Mirrors EXACTLY the
 * 1782200000000-CreateBookings pattern for `payments.booking_id` /
 * `chk_payments_order_or_booking`: the order-item triple becomes nullable,
 * `booking_id` is added, and a CHECK enforces exactly one source is set (the
 * order-item triple as a group, or booking_id alone) — never both, never
 * neither. All existing commission rows already have the full order-item
 * triple set (booking_id defaults NULL), so this is backward compatible with
 * the live order/payout flow; `PayoutService.computePayoutTotals` batches on
 * vendor_id + status only (no JOIN requiring the order-item columns), so a
 * booking-sourced row flows through the same payout pipeline unchanged.
 *
 * REVIEW FIX (money-safety BLOCKER): `booking_id` originally got only a PLAIN
 * partial index (`idx_commissions_booking`). Under READ COMMITTED, two
 * concurrent `/complete` calls for the SAME booking (e.g. an admin click
 * racing Phase 5's auto-complete job — `completeBooking()` is deliberately
 * designed to let both fire the completion hook, see
 * BookingStatusService.completeBooking's comment) could both `findOne` and
 * see nothing before either commits, then both INSERT — two commission rows,
 * double vendor-payout accrual for one booking. Replaced with a genuinely
 * UNIQUE partial index (`uq_commissions_booking`) so the DB itself rejects
 * the second concurrent insert (Postgres 23505); `CommissionService
 * .createForBookingInTx` catches that and returns the winner's row instead of
 * throwing (mirrors the existing `vendor-layout-init.service.ts` pattern).
 *
 * REVIEW FIX (commission_type mislabeling): also adds `bookings.commission_type`
 * (reuses the existing shared `commission_type` enum type — same one
 * `vendors.commission_type` / `commissions.commission_type` already use) so
 * the resolved type ("percentage" | "fixed" | "tiered") is snapshotted at
 * booking time alongside `commission_rate`/`commission_fils`, instead of the
 * accrual endpoint hardcoding `"percentage"` for every booking row (which
 * mislabels a fixed-rate vendor's fils CAP as if it were a percent).
 */
export class CommissionBookingAccrual1782300000000 implements MigrationInterface {
  name = "CommissionBookingAccrual1782300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "commissions" ALTER COLUMN "order_id" DROP NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "commissions" ALTER COLUMN "vendor_order_id" DROP NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "commissions" ALTER COLUMN "order_item_id" DROP NOT NULL`);

    await queryRunner.query(`ALTER TABLE "commissions" ADD COLUMN "booking_id" uuid`);
    // NOT VALID — see the identical note in 1782200000000-CreateBookings for
    // `payments`. `commissions` is a live table that grows with every order
    // item; a validating ADD CONSTRAINT would scan it all under a blocking
    // lock during the deploy migrate run. The scan is deferred to
    // VALIDATE CONSTRAINT in the trailing
    // BookingLiveTableConstraintsConcurrent migration. New/updated rows are
    // enforced immediately regardless.
    await queryRunner.query(
      `ALTER TABLE "commissions" ADD CONSTRAINT "fk_commissions_booking" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") NOT VALID`,
    );
    // UNIQUE (not plain) — see the REVIEW FIX comment above. A booking can
    // accrue at most ONE commission row; the DB enforces it, app-level
    // findOne-then-insert is not sufficient under concurrency.
    // NOTE: built CONCURRENTLY in the trailing
    // BookingLiveTableConstraintsConcurrent migration — a plain CREATE UNIQUE
    // INDEX here would take SHARE and block every write to `commissions` for
    // the whole build. The uniqueness guarantee described above is unchanged;
    // it simply starts enforcing a few seconds later in the same deploy, and
    // no booking-sourced commission row can exist before the booking feature
    // itself is live.

    await queryRunner.query(`
      ALTER TABLE "commissions" ADD CONSTRAINT "chk_commissions_order_or_booking" CHECK (
        (
          "order_id" IS NOT NULL AND "vendor_order_id" IS NOT NULL AND "order_item_id" IS NOT NULL
          AND "booking_id" IS NULL
        )
        OR
        (
          "order_id" IS NULL AND "vendor_order_id" IS NULL AND "order_item_id" IS NULL
          AND "booking_id" IS NOT NULL
        )
      ) NOT VALID
    `);

    // REVIEW FIX: snapshot the resolved commission TYPE onto the booking row
    // (mirrors commission_rate/commission_fils's existing snapshot pattern).
    // Reuses the shared `commission_type` enum type (percentage/fixed/tiered)
    // already used by vendors.commission_type and commissions.commission_type.
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD COLUMN "commission_type" "commission_type" NOT NULL DEFAULT 'percentage'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN IF EXISTS "commission_type"`);

    await queryRunner.query(
      `ALTER TABLE "commissions" DROP CONSTRAINT IF EXISTS "chk_commissions_order_or_booking"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_commissions_booking"`);
    await queryRunner.query(
      `ALTER TABLE "commissions" DROP CONSTRAINT IF EXISTS "fk_commissions_booking"`,
    );
    await queryRunner.query(`ALTER TABLE "commissions" DROP COLUMN IF EXISTS "booking_id"`);

    await queryRunner.query(`ALTER TABLE "commissions" ALTER COLUMN "order_item_id" SET NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "commissions" ALTER COLUMN "vendor_order_id" SET NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "commissions" ALTER COLUMN "order_id" SET NOT NULL`);
  }
}
