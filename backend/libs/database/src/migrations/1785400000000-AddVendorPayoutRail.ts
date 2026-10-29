import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddVendorPayoutRail1785400000000 implements MigrationInterface {
  name = "AddVendorPayoutRail1785400000000";

  public async up(q: QueryRunner): Promise<void> {
    // IF NOT EXISTS on both statements so a re-run is a no-op rather than a
    // deploy-breaking "type already exists" / "column already exists".
    await q.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vendor_payouts_payout_rail_enum') THEN
          CREATE TYPE "vendor_payouts_payout_rail_enum" AS ENUM ('manual_bank_transfer', 'stripe_connect');
        END IF;
      END$$;
    `);

    await q.query(`
      ALTER TABLE "vendor_payouts"
        ADD COLUMN IF NOT EXISTS "payout_rail" "vendor_payouts_payout_rail_enum";
    `);

    // Every payout that already left `pending` was, by definition, a Stripe
    // Connect transfer — that was the only rail that existed. Backfill those
    // so historical rows report how they were actually paid.
    //
    // Pending drafts are deliberately left NULL: their rail has not been
    // chosen yet, and stamping one here would pre-commit a decision the
    // operator is supposed to make at pay time.
    await q.query(`
      UPDATE "vendor_payouts"
         SET "payout_rail" = 'stripe_connect'
       WHERE "payout_rail" IS NULL
         AND "status" <> 'pending';
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "vendor_payouts" DROP COLUMN IF EXISTS "payout_rail";`);
    await q.query(`DROP TYPE IF EXISTS "vendor_payouts_payout_rail_enum";`);
  }
}
