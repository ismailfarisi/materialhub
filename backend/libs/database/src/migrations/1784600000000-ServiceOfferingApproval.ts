import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Admin approval for service offerings (Slice 1 Task 1).
 *
 * A vendor's FIRST offering needs admin sign-off; after that the vendor is
 * trusted and self-publishes. That needs two new offering statuses, three
 * review-audit columns, and a per-vendor trust flag.
 *
 * The backfill is the load-bearing part: every vendor that already has an
 * offering in published, paused, or archived status — i.e. has genuinely
 * operated a real service before, not just left one in draft — is marked
 * trusted. Without it, the next publish attempt from an existing vendor whose
 * offering happened to be paused or archived at deploy time (seasonal
 * closure, Ramadan hours, short-staffed) would be rewritten to pending_review
 * by the new gate in ServiceOfferingService.update, silently sending a vendor
 * who was told "this becomes bookable immediately" into an admin queue
 * instead. A draft-only vendor has never actually operated a service, so it
 * is correctly left untrusted pending its first review.
 *
 * ALTER TYPE ... ADD VALUE is safe inside TypeORM's transaction on PG 12+ so
 * long as the new value is not USED in the same transaction. It is not: the
 * backfill below only writes to vendors.services_trusted (a boolean) and reads
 * service_offerings.status IN ('published','paused','archived') — all pre-existing
 * values, none of them the two added above.
 */
export class ServiceOfferingApproval1784600000000 implements MigrationInterface {
  name = "ServiceOfferingApproval1784600000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TYPE "service_offerings_status_enum" ADD VALUE IF NOT EXISTS 'pending_review'`,
    );
    await q.query(`ALTER TYPE "service_offerings_status_enum" ADD VALUE IF NOT EXISTS 'rejected'`);

    await q.query(`ALTER TABLE "service_offerings" ADD COLUMN "rejection_reason" text`);
    await q.query(`ALTER TABLE "service_offerings" ADD COLUMN "reviewed_at" timestamptz`);
    await q.query(`ALTER TABLE "service_offerings" ADD COLUMN "reviewed_by" uuid`);

    await q.query(
      `ALTER TABLE "vendors" ADD COLUMN "services_trusted" boolean NOT NULL DEFAULT false`,
    );

    // Grandfather every vendor that already has an offering in published,
    // paused, or archived status — any of those means the vendor has
    // genuinely operated a real service before. A vendor whose offering is
    // merely paused (e.g. seasonal closure) or archived must not be treated
    // as a brand-new, untrusted vendor: 'pending_review'/'rejected' are
    // deliberately excluded (those aren't evidence of a real operating
    // service), and 'draft' is excluded because it never went live.
    await q.query(`
      UPDATE "vendors" v
      SET "services_trusted" = true
      WHERE EXISTS (
        SELECT 1 FROM "service_offerings" o
        WHERE o."vendor_id" = v."id"
          AND o."status" IN ('published', 'paused', 'archived')
          AND o."deleted_at" IS NULL
      )
    `);

    // No new index needed here: CreateServiceOfferings1782000000000 already
    // created "idx_service_offerings_status" on ("status") WHERE deleted_at
    // IS NULL — identical to what this migration would otherwise add. Adding
    // a second index with the same definition would just be duplicate
    // storage/write overhead, and CREATE INDEX with this name fails 42P07
    // on any already-migrated database.
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "vendors" DROP COLUMN IF EXISTS "services_trusted"`);
    await q.query(`ALTER TABLE "service_offerings" DROP COLUMN IF EXISTS "reviewed_by"`);
    await q.query(`ALTER TABLE "service_offerings" DROP COLUMN IF EXISTS "reviewed_at"`);
    await q.query(`ALTER TABLE "service_offerings" DROP COLUMN IF EXISTS "rejection_reason"`);
    // Postgres cannot remove enum values without recreating the type and
    // rewriting dependent columns. The two added values stay — harmless, and
    // consistent with AddCancelledShipmentStatus1781800000000's posture.
  }
}
