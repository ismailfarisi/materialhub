import type { MigrationInterface, QueryRunner } from "typeorm";

export class PayoutCorrectness1784800000000 implements MigrationInterface {
  name = "PayoutCorrectness1784800000000";

  public async up(q: QueryRunner): Promise<void> {
    // 1. Columns
    await q.query(`ALTER TABLE "commissions" ADD COLUMN "settle_after" timestamptz;`);
    await q.query(`ALTER TABLE "vendor_orders" ADD COLUMN "delivered_at" timestamptz;`);
    await q.query(`ALTER TABLE "vendors" ADD COLUMN "settlement_window_days" integer;`);
    await q.query(`ALTER TABLE "vendors"
      ADD CONSTRAINT "vendors_settlement_window_nonneg"
      CHECK ("settlement_window_days" IS NULL OR "settlement_window_days" >= 0);`);

    // 2. Adjustment ledger
    await q.query(`
      CREATE TABLE "vendor_payout_adjustments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "vendor_id" uuid NOT NULL,
        "amount_fils" integer NOT NULL,
        "reason" varchar(255) NOT NULL,
        "source_type" varchar(50) NOT NULL,
        "source_id" uuid,
        "settled_payout_id" uuid,
        "created_by" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_vendor_payout_adjustments" PRIMARY KEY ("id"),
        CONSTRAINT "vendor_payout_adjustments_amount_nonzero" CHECK ("amount_fils" <> 0),
        CONSTRAINT "fk_vendor_payout_adjustment_vendor"
          FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_vendor_payout_adjustment_payout"
          FOREIGN KEY ("settled_payout_id") REFERENCES "vendor_payouts"("id") ON DELETE SET NULL
      );`);
    await q.query(`CREATE INDEX "idx_vendor_payout_adjustment_unsettled"
      ON "vendor_payout_adjustments" ("vendor_id")
      WHERE "settled_payout_id" IS NULL AND "deleted_at" IS NULL;`);

    // 3. Payout reference sequence — replaces Date.now() % 1000000, which
    //    collides every ~16.7 minutes.
    await q.query(`CREATE SEQUENCE IF NOT EXISTS "payout_reference_seq" START 1;`);

    // 4. Index backing the payable predicate on every path.
    await q.query(`CREATE INDEX "idx_commissions_payable"
      ON "commissions" ("vendor_id", "status", "settle_after")
      WHERE "payout_id" IS NULL AND "deleted_at" IS NULL;`);

    // 5. Settlement window default.
    await q.query(`
      INSERT INTO "site_settings" ("key", "value", "value_type", "setting_group", "description")
      VALUES ('payout_settlement_window_days', '7', 'number', 'commission',
              'Days after delivery before a vendor commission becomes payable')
      ON CONFLICT ("key") WHERE "deleted_at" IS NULL DO NOTHING;`);

    // 6. Backfill delivered_at from history (earliest delivered transition
    //    wins) — but ONLY for vendor_orders that are STILL delivered.
    //
    //    R4-C3: without that status check this stamped a delivery timestamp
    //    on every order that was EVER delivered, including ones since
    //    returned or refunded. Step 8 then handed each of them a settlement
    //    clock that had already matured, so the hourly settlement job made
    //    them payable on its first tick and the first-ever draft paid them
    //    at their full pre-reversal value — commission reversal on returns
    //    is itself new in this branch, so every historical
    //    delivered-then-returned order carries an unreduced commission. This
    //    is the same guard the code path carries and this migration omitted
    //    (commission.service.ts's re-stamp: "don't let a backfill restart a
    //    clock a return stopped").
    await q.query(`
      UPDATE "vendor_orders" vo
         SET "delivered_at" = h.first_delivered
        FROM (
          SELECT "vendor_order_id", MIN("created_at") AS first_delivered
            FROM "order_status_history"
           WHERE "to_status" = 'delivered' AND "vendor_order_id" IS NOT NULL
           GROUP BY "vendor_order_id"
        ) h
       WHERE h."vendor_order_id" = vo."id"
         AND vo."status" = 'delivered';`);

    // 6b. Gift-box legs, R4-C4. A leg is completed by HUB RECEIPT, not by a
    //     delivery transition: GiftFulfillmentService writes
    //     `received_at_hub_at` + `status = 'delivered'` and records its
    //     history in `gift_order_status_history`, so step 6 finds nothing for
    //     it. Before this branch those legs' commissions were promoted
    //     straight to `pending` at receipt; step 7 below sweeps them back to
    //     `held`, and without a `delivered_at` step 8 could never re-stamp
    //     them — leaving `held` + `settle_after IS NULL`, which
    //     `runCommissionSettlement` can never promote, no admin action can
    //     repair, and nothing re-runs hub receipt for an already-received
    //     leg. Receipt time IS this leg's delivery time, so backfill it as
    //     such. (The code side now stamps `delivered_at` at receipt too, so
    //     this is a one-time repair for legs received before that shipped.)
    await q.query(`
      UPDATE "vendor_orders" vo
         SET "delivered_at" = vo."received_at_hub_at"
       WHERE vo."gift_order_id" IS NOT NULL
         AND vo."received_at_hub_at" IS NOT NULL
         AND vo."delivered_at" IS NULL
         AND vo."status" = 'delivered';`);

    // 7. Sweep only `pending` rows into `held`.
    //
    //    Deliberately NOT "everything non-terminal": `held` already means
    //    something here (gift-box legs awaiting hub receipt), and `disputed`
    //    carries state this migration has no business erasing.
    await q.query(`
      UPDATE "commissions" SET "status" = 'held'
       WHERE "status" = 'pending';`);

    // 8. Commissions whose vendor_order is delivered get a real clock, using
    //    the vendor override where present, then the global site_setting,
    //    then 7 days — the exact precedence every code path uses via
    //    `resolveWindowDays`, and the same COALESCE chain the sibling
    //    migration 1785000000000 uses. Hardcoding the 7 ignored an operator
    //    who had already configured `payout_settlement_window_days`.
    //
    //    R4-C3: `vo."status" = 'delivered'` as well as a non-null
    //    `delivered_at`. `delivered_at` is deliberately never cleared when an
    //    order leaves `delivered` (it is the historical record), so it alone
    //    does not mean "currently delivered" — and after step 6b it is also
    //    set on gift legs whose status could since have moved on. A
    //    commission whose order is no longer delivered keeps
    //    `settle_after IS NULL` and stays unpayable, which is the correct
    //    outcome for goods the customer returned.
    await q.query(`
      UPDATE "commissions" c
         SET "settle_after" = vo."delivered_at"
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
        FROM "vendor_orders" vo
        JOIN "vendors" v ON v."id" = vo."vendor_id"
       WHERE vo."id" = c."vendor_order_id"
         AND vo."delivered_at" IS NOT NULL
         AND vo."status" = 'delivered'
         AND c."status" = 'held';`);
  }

  public async down(q: QueryRunner): Promise<void> {
    // Revert only what up() swept. A gift leg the hub has NOT yet received
    // was `held` before this migration existed and must stay held —
    // releasing it to `pending` would make it payable without the hub ever
    // receiving it. A leg the hub HAS received was `pending` before this
    // migration (hub receipt promoted it directly, pre-branch), so excluding
    // every gift leg from this revert stranded exactly the rows R4-C4 is
    // about. Restore those too.
    await q.query(`
      UPDATE "commissions" c SET "status" = 'pending'
       WHERE c."status" = 'held'
         AND NOT EXISTS (
           SELECT 1 FROM "vendor_orders" vo
            WHERE vo."id" = c."vendor_order_id"
              AND vo."gift_order_id" IS NOT NULL
              AND vo."received_at_hub_at" IS NULL
         );`);
    await q.query(`DROP INDEX IF EXISTS "idx_commissions_payable";`);
    await q.query(`DROP SEQUENCE IF EXISTS "payout_reference_seq";`);
    await q.query(`DROP TABLE IF EXISTS "vendor_payout_adjustments";`);
    await q.query(
      `ALTER TABLE "vendors" DROP CONSTRAINT IF EXISTS "vendors_settlement_window_nonneg";`,
    );
    await q.query(`ALTER TABLE "vendors" DROP COLUMN IF EXISTS "settlement_window_days";`);
    await q.query(`ALTER TABLE "vendor_orders" DROP COLUMN IF EXISTS "delivered_at";`);
    await q.query(`ALTER TABLE "commissions" DROP COLUMN IF EXISTS "settle_after";`);
  }
}
