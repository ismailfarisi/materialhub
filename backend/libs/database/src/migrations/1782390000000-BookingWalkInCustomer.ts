import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Phase 6 Task 1 (manual walk-in / phone booking, spec off-platform capacity).
 * A walk-in/phone booking taken by vendor staff has no MaterialHub customer
 * account — it's a name/phone jotted down at the desk — so `bookings` needs
 * three schema changes to represent that:
 *
 *   - `customer_user_id` DROP NOT NULL — was mandatory (every booking used to
 *     imply a logged-in customer). `fk_bookings_customer` (1782200000000)
 *     stays: Postgres FKs only validate non-NULL values, so a NULL
 *     customer_user_id is unaffected by the existing constraint.
 *   - `customer_name`/`customer_phone` — free-text capture for the walk-in
 *     (mirrors how `bookings.customer_address` is a plain nullable column,
 *     not a FK'd relation) — inline on the booking row rather than a
 *     users-table stub, since a walk-in is explicitly NOT a MaterialHub account.
 *   - `service_offering_id` DROP NOT NULL — ManualBookingService (Task 1)
 *     lets a manager create a booking row from customer details ALONE (no
 *     service picked yet, e.g. a phone booking where the service is decided
 *     at the desk); `fk_bookings_offering` (1782200000000) stays for the same
 *     NULL-values-skip-validation reason as customer_user_id above. When no
 *     service is given, ManualBookingService snapshots a minimal row
 *     (price/vat/deposit/commission = 0, service_name = a caller-supplied
 *     label or "Walk-in"/"Phone booking") instead of a service snapshot.
 *
 * `bookings.source` (varchar, default 'marketplace') already anticipates
 * 'walk_in'/'phone' per its column comment (1782200000000) — no migration
 * needed for it, ManualBookingService just writes the value.
 */
export class BookingWalkInCustomer1782390000000 implements MigrationInterface {
  name = "BookingWalkInCustomer1782390000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "bookings" ALTER COLUMN "customer_user_id" DROP NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "bookings" ALTER COLUMN "service_offering_id" DROP NOT NULL`,
    );

    await queryRunner.query(`ALTER TABLE "bookings" ADD COLUMN "customer_name" varchar(255)`);
    await queryRunner.query(`ALTER TABLE "bookings" ADD COLUMN "customer_phone" varchar(32)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN IF EXISTS "customer_phone"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN IF EXISTS "customer_name"`);

    // Reverting SET NOT NULL would fail if any walk-in/phone rows with a NULL
    // customer_user_id or service_offering_id exist by the time this runs —
    // acceptable: a down-migration on data that has since diverged from the
    // pre-Phase-6 invariant is expected to require a manual data decision,
    // same posture as other NOT-NULL-tightening `down()`s in this migrations
    // directory.
    await queryRunner.query(
      `ALTER TABLE "bookings" ALTER COLUMN "service_offering_id" SET NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "bookings" ALTER COLUMN "customer_user_id" SET NOT NULL`);
  }
}
