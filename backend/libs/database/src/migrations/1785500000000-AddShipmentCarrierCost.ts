import type { MigrationInterface, QueryRunner } from "typeorm";

const SETTING_KEY = "shipping.base_carrier_cost_fils";
const FALLBACK_FILS = 1300;
// PostgreSQL int4 max value; out-of-range DEFAULT in ADD COLUMN fails the entire migration.
const MAX_INT4 = 2147483647;

export class AddShipmentCarrierCost1785500000000 implements MigrationInterface {
  name = "AddShipmentCarrierCost1785500000000";

  public async up(q: QueryRunner): Promise<void> {
    // Backfill existing shipments with the rate configured RIGHT NOW rather
    // than 0. Leaving them 0 would preserve exactly the "carrier_cost_total is
    // always zero" problem this column exists to fix, for every historical
    // payout. This does assert the current rate applied to shipments that
    // predate the setting — probable, not provable, and accepted deliberately.
    const rows: Array<{ value: string }> = await q.query(
      "SELECT value FROM site_settings WHERE key = $1 AND deleted_at IS NULL LIMIT 1",
      [SETTING_KEY],
    );
    const parsed = Number(rows?.[0]?.value);
    const backfill =
      Number.isInteger(parsed) && parsed >= 0 && parsed <= MAX_INT4 ? parsed : FALLBACK_FILS;

    // The backfill rides on ADD COLUMN's DEFAULT, which fills every existing
    // row in one statement, then the default drops to 0 for new rows (which
    // are stamped explicitly by ShipmentTrackingService.createShipment).
    //
    // `backfill` is interpolated rather than parameterised because Postgres
    // does not accept bind parameters in a DDL DEFAULT clause. It is safe: the
    // value came from Number.isInteger + bounds check, so it is a proven
    // non-negative int4, and cannot carry SQL or overflow the column type.
    //
    // IF NOT EXISTS makes a re-run a no-op instead of a deploy-breaking
    // "column already exists" — and on that re-run existing rows keep the
    // values they already have.
    await q.query(
      `ALTER TABLE "shipments"
         ADD COLUMN IF NOT EXISTS "carrier_cost_fils" integer NOT NULL DEFAULT ${backfill}`,
    );
    await q.query(`ALTER TABLE "shipments" ALTER COLUMN "carrier_cost_fils" SET DEFAULT 0`);

    // shipments has an FK on vendor_order_id but Postgres does not auto-index
    // FK columns. computePayoutTotals now runs
    // `WHERE vendor_order_id = ANY($1::uuid[])` against this table once per
    // vendor per draft run, which would otherwise sequential-scan.
    await q.query(
      `CREATE INDEX IF NOT EXISTS "shipments_vendor_order_id_idx"
         ON "shipments" ("vendor_order_id") WHERE "deleted_at" IS NULL`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "shipments_vendor_order_id_idx"`);
    await q.query(`ALTER TABLE "shipments" DROP COLUMN IF EXISTS "carrier_cost_fils"`);
  }
}
