import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * `payments` had no index on `order_id`.
 *
 * The FK `fk_payments_order` does not create one — Postgres indexes the
 * referenced side, never the referencing side — so every "the payments for
 * this order" lookup was a sequential scan of a table that grows with every
 * checkout. That is the single hottest access pattern on `payments`:
 *
 *   - `PendingOrderReaperService.reapOne` runs one such lookup per candidate
 *     order, every 5 minutes, forever.
 *   - `vendorVisibleOrderPredicate` (order-service) probes `payments` for a
 *     `cod` row; without this index the planner turns the correlated subquery
 *     into a hashed SubPlan — a full scan of `payments` hashed once per query
 *     — and `DashboardService.vendorStats` fires five of those in one
 *     `Promise.all`.
 *   - Refunds, order cancellation and the checkout webhooks all resolve an
 *     order's payment rows the same way.
 *
 * Partial (`WHERE order_id IS NOT NULL`) to match `idx_payments_booking`:
 * `chk_payments_order_or_booking` makes exactly one of the two columns non-null,
 * so booking payments are dead weight in this index.
 *
 * ── Why `transaction = false` ─────────────────────────────────────────────
 * `payments` is a live table on the payment path and the `migrate` compose
 * service runs on every deploy, so a plain `CREATE INDEX` — which takes SHARE
 * and blocks writes for the whole build — is not acceptable here. The
 * CONCURRENTLY form cannot run inside a transaction block, and the runner
 * (`libs/database/src/run-migrations.ts`) uses
 * `runMigrations({ transaction: "each" })`; TypeORM's MigrationExecutor
 * honours a per-migration `transaction = false` override under `"each"`.
 * Same pattern and same rationale as
 * `BookingLiveTableConstraintsConcurrent1784503800000`.
 *
 * Running unwrapped means a mid-way failure leaves the work partially applied
 * AND unrecorded in `migrations`, so the next deploy re-runs this from the
 * top. Hence the `DROP INDEX CONCURRENTLY IF EXISTS` first: an interrupted
 * CONCURRENTLY build leaves behind an INVALID index that a bare
 * `IF NOT EXISTS` would silently skip over, permanently leaving the index
 * present-but-not-usable. Dropping first guarantees we always end on a valid
 * index.
 */
export class AddPaymentsOrderIdIndex1785100000000 implements MigrationInterface {
  name = "AddPaymentsOrderIdIndex1785100000000";

  // See the "Why `transaction = false`" note above — required for
  // CREATE INDEX CONCURRENTLY.
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "idx_payments_order"`);
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_payments_order" ON "payments" ("order_id") WHERE "order_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "idx_payments_order"`);
  }
}
