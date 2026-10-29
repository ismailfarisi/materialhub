import type { MigrationInterface, QueryRunner } from "typeorm";

export class BookingCommissionSettlementClock1785000000000 implements MigrationInterface {
  name = "BookingCommissionSettlementClock1785000000000";

  public async up(q: QueryRunner): Promise<void> {
    // C3 fix (payout-correctness final review): PayoutCorrectness1784800000000
    // step 7 swept every `pending` commission — order-sourced AND
    // booking-sourced alike — into `held`, but step 8 only stamped
    // `settle_after` for rows with a delivered `vendor_order`. A booking has
    // no `vendor_order`, so every booking-sourced commission that existed
    // before this migration is `held` with `settle_after IS NULL` and can
    // never satisfy the settlement job's `settle_after <= now()` predicate —
    // stranded `held` forever, never promoted to `pending`, never payable.
    //
    // The code-side fix (CommissionService.createForBookingInTx) now stamps
    // `settle_after` from "now" + the vendor's settlement window at INSERT
    // time for every NEW booking commission. This migration is the matching
    // one-time backfill for the rows that already existed before that code
    // shipped: it applies the identical rule, using each row's `created_at`
    // (the moment it WAS accrued, i.e. what "now" would have been had the
    // fixed code created it) in place of "now", and the same vendor-override
    // -> global-site_setting -> 7-day fallback used everywhere else
    // (resolveWindowDays / getSettlementWindowDays).
    //
    // Scope: only `held` rows with `booking_id IS NOT NULL` and
    // `settle_after IS NULL` — i.e. exactly the rows step 8 of the prior
    // migration could not reach. Order-sourced commissions (booking_id IS
    // NULL) are untouched; they already have their own settle_after story.
    await q.query(`
      UPDATE "commissions" c
         SET "settle_after" = c."created_at"
              + (
                  COALESCE(
                    v."settlement_window_days",
                    (SELECT ss."value"::integer FROM "site_settings" ss
                      WHERE ss."key" = 'payout_settlement_window_days'
                        AND ss."deleted_at" IS NULL
                      LIMIT 1),
                    7
                  ) || ' days'
                )::interval
        FROM "vendors" v
       WHERE v."id" = c."vendor_id"
         AND c."booking_id" IS NOT NULL
         AND c."status" = 'held'
         AND c."settle_after" IS NULL;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    // Reverses this migration's backfill by clearing settle_after on every
    // booking-sourced `held` commission. This is not a surgical row-by-row
    // undo (there is no marker distinguishing a row this migration stamped
    // from one CommissionService.createForBookingInTx stamped itself after
    // the matching code fix shipped) — same caveat PayoutCorrectness's own
    // down() carries for its `held` -> `pending` sweep. Rolling back this
    // migration means "stop trusting settle_after on held booking
    // commissions," which is the correct down for a schema/data migration
    // meant to be reverted together with its code counterpart.
    await q.query(`
      UPDATE "commissions"
         SET "settle_after" = NULL
       WHERE "booking_id" IS NOT NULL
         AND "status" = 'held';
    `);
  }
}
