import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Deploy-safety companion to `CreateBookings` and `CommissionBookingAccrual`
 * (booking review fix #1).
 *
 * `payments` and `commissions` are LIVE tables that grow with every order, and
 * the `migrate` compose service runs on every deploy. The booking work attaches
 * new FKs, CHECKs and indexes to both. Done naively that is a production
 * outage on the payment path:
 *
 *   - `ADD CONSTRAINT ... CHECK`  → ACCESS EXCLUSIVE + full table scan
 *                                   (blocks reads AND writes)
 *   - `ADD CONSTRAINT ... FOREIGN KEY` → SHARE ROW EXCLUSIVE + validation scan
 *                                   (blocks writes)
 *   - `CREATE [UNIQUE] INDEX`     → SHARE (blocks writes for the whole build)
 *
 * So the two upstream migrations now add their constraints `NOT VALID` (brief
 * lock, no scan; still enforced for every new/updated row) and defer the scan
 * here, and they no longer build their indexes at all. This migration does the
 * expensive half using only locks that let concurrent traffic through:
 *
 *   - `VALIDATE CONSTRAINT`     → SHARE UPDATE EXCLUSIVE (reads + writes OK)
 *   - `CREATE INDEX CONCURRENTLY` → no write lock
 *
 * ── Why `transaction = false` ─────────────────────────────────────────────
 * `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block, and the
 * migrate runner (`libs/database/src/run-migrations.ts`) calls
 * `runMigrations({ transaction: "each" })`, which wraps each migration in one.
 * TypeORM's MigrationExecutor honours a per-migration `transaction = false`
 * override under `"each"` (it only forces the mode when the class leaves the
 * flag `undefined`), so this migration — and only this one — runs unwrapped.
 * This is the first use of that flag in this repo; every other migration keeps
 * the default transactional behaviour.
 *
 * ── Why that is safe despite being non-atomic ─────────────────────────────
 * Running unwrapped means a mid-way failure leaves this migration's work
 * partially applied AND unrecorded in `migrations`, so the next deploy re-runs
 * it from the top. Every statement below is therefore written to be
 * idempotent:
 *
 *   - `VALIDATE CONSTRAINT` is a no-op on an already-validated constraint.
 *   - Each index is dropped `CONCURRENTLY IF EXISTS` before being created
 *     `CONCURRENTLY IF NOT EXISTS`. The drop is what makes this genuinely
 *     re-runnable: a failed/interrupted CONCURRENTLY build leaves behind an
 *     INVALID index that `IF NOT EXISTS` alone would happily skip over,
 *     silently leaving a non-enforcing `uq_commissions_booking` — i.e. the
 *     double-accrual race it exists to close would be back open. Dropping
 *     first guarantees we always end on a valid, enforcing index.
 *
 * `down()` only drops the indexes; it deliberately does NOT un-validate the
 * constraints (Postgres has no `ALTER CONSTRAINT ... SET NOT VALID`, and the
 * constraints themselves are dropped by the upstream migrations' own `down()`).
 */
export class BookingLiveTableConstraintsConcurrent1784503800000 implements MigrationInterface {
  name = "BookingLiveTableConstraintsConcurrent1784503800000";

  // See the "Why `transaction = false`" note above — required for
  // CREATE INDEX CONCURRENTLY.
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Indexes deferred out of CreateBookings / CommissionBookingAccrual ──

    // Partial plain index: look up the payment(s) attached to a booking.
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "idx_payments_booking"`);
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_payments_booking" ON "payments" ("booking_id") WHERE "booking_id" IS NOT NULL`,
    );

    // Partial UNIQUE index — a booking accrues at most ONE commission row.
    // This is a money-safety constraint, not an optimisation: it is what stops
    // two concurrent `/complete` calls for the same booking from both
    // INSERTing and double-accruing the vendor payout.
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "uq_commissions_booking"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "uq_commissions_booking" ON "commissions" ("booking_id") WHERE "booking_id" IS NOT NULL`,
    );

    // ── Validate the NOT VALID constraints (SHARE UPDATE EXCLUSIVE) ──
    // Existing rows cannot violate either CHECK: every pre-existing payment
    // has order_id NOT NULL, every pre-existing commission has the full
    // order-item triple, and booking_id was NULL-by-default on both, so these
    // scans are guaranteed to succeed.
    await queryRunner.query(`ALTER TABLE "payments" VALIDATE CONSTRAINT "fk_payments_booking"`);
    await queryRunner.query(
      `ALTER TABLE "payments" VALIDATE CONSTRAINT "chk_payments_order_or_booking"`,
    );
    await queryRunner.query(
      `ALTER TABLE "commissions" VALIDATE CONSTRAINT "fk_commissions_booking"`,
    );
    await queryRunner.query(
      `ALTER TABLE "commissions" VALIDATE CONSTRAINT "chk_commissions_order_or_booking"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "uq_commissions_booking"`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "idx_payments_booking"`);
  }
}
