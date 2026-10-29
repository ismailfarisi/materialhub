import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Seeding fulfilment (spec §7.5).
 *
 * Replaces `collab_applications.shipment_id` with carrier/tracking fields.
 * `shipments` requires both `order_id` and `vendor_order_id` NOT NULL, and a
 * seeded product has neither — there is no order and no payment. Satisfying the
 * FK would have meant minting a synthetic zero-value order per seeding, which
 * would pollute orders, GMV reporting, commissions and payouts. The vendor ships
 * however they already ship; we record what the creator needs to track it.
 *
 * Also adds the fulfilment clock:
 *   shipped_at  — when the vendor dispatched
 *   received_at — when the creator confirmed (or a carrier event fired)
 *   deliver_by  — the creator's ABSOLUTE deadline, resolved at receipt.
 *
 * `deliver_by` is snapshotted per application rather than read from the
 * opportunity so that (a) the clock starts when the product actually arrives,
 * not when the vendor accepted — a creator should not lose days of their window
 * to shipping — and (b) a later edit to the opportunity cannot move a deadline
 * out from under a creator who is already working.
 */
export class CollabSeedingFulfilment1785700000000 implements MigrationInterface {
  name = "CollabSeedingFulfilment1785700000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "collab_applications" DROP COLUMN "shipment_id";`);
    await q.query(`ALTER TABLE "collab_applications" ADD COLUMN "carrier" varchar(100);`);
    await q.query(`ALTER TABLE "collab_applications" ADD COLUMN "tracking_number" varchar(255);`);
    await q.query(`ALTER TABLE "collab_applications" ADD COLUMN "shipped_at" timestamptz;`);
    await q.query(`ALTER TABLE "collab_applications" ADD COLUMN "received_at" timestamptz;`);
    await q.query(`ALTER TABLE "collab_applications" ADD COLUMN "deliver_by" timestamptz;`);

    // Drives the 21-day no-receipt sweep: in-transit applications, oldest first.
    await q.query(
      `CREATE INDEX "idx_collab_app_awaiting_receipt" ON "collab_applications" ("shipped_at")
         WHERE "deleted_at" IS NULL AND "received_at" IS NULL;`,
    );
    // Drives the deliver-by reminder job.
    await q.query(
      `CREATE INDEX "idx_collab_app_deliver_by" ON "collab_applications" ("deliver_by")
         WHERE "deleted_at" IS NULL AND "completed_at" IS NULL;`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "idx_collab_app_deliver_by";`);
    await q.query(`DROP INDEX IF EXISTS "idx_collab_app_awaiting_receipt";`);
    await q.query(`ALTER TABLE "collab_applications" DROP COLUMN "deliver_by";`);
    await q.query(`ALTER TABLE "collab_applications" DROP COLUMN "received_at";`);
    await q.query(`ALTER TABLE "collab_applications" DROP COLUMN "shipped_at";`);
    await q.query(`ALTER TABLE "collab_applications" DROP COLUMN "tracking_number";`);
    await q.query(`ALTER TABLE "collab_applications" DROP COLUMN "carrier";`);
    await q.query(`ALTER TABLE "collab_applications" ADD COLUMN "shipment_id" uuid;`);
  }
}
