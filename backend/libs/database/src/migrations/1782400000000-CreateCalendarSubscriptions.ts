import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Phase 6 Task 4 (spec off-platform capacity — inbound iCal import). A vendor
 * registers an external calendar (Google / Fresha / etc.) as an iCal URL
 * against ONE staff member; the `ical-import.job.ts` poller fetches it and
 * writes each event into the SAME `staff_engagements` capacity ledger as
 * `kind=external_import` rows keyed on `external_source=<subscription id>` +
 * `external_ref=<event uid>`, so external bookings block MaterialHub availability.
 *
 * `vendor_id` is denormalized (consistent with `staff_engagements` carrying its
 * own `vendor_id`) so the poller and the conflict-notification recipient
 * lookup can scope without a join. Soft-deleted (`deleted_at`) — removing a
 * subscription releases its engagements immediately but keeps the row for
 * audit; the partial unique index lets the staff member re-register afterwards.
 */
export class CreateCalendarSubscriptions1782400000000 implements MigrationInterface {
  name = "CreateCalendarSubscriptions1782400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "staff_calendar_subscriptions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "staff_member_id" uuid NOT NULL,
        "vendor_id" uuid NOT NULL,
        "ical_url" text NOT NULL,
        "last_synced_at" timestamptz,
        "last_sync_error" varchar(500),
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "fk_calendar_sub_staff" FOREIGN KEY ("staff_member_id") REFERENCES "staff_members"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_calendar_sub_vendor" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id")
      )
    `);

    // One live subscription per staff member (PUT replaces it). Partial so a
    // soft-deleted subscription doesn't block re-registration.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_calendar_sub_staff" ON "staff_calendar_subscriptions" ("staff_member_id") WHERE "deleted_at" IS NULL`,
    );
    // Poller scans active, non-deleted subscriptions each tick.
    await queryRunner.query(
      `CREATE INDEX "idx_calendar_sub_active" ON "staff_calendar_subscriptions" ("is_active") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_calendar_sub_vendor" ON "staff_calendar_subscriptions" ("vendor_id") WHERE "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "staff_calendar_subscriptions"`);
  }
}
