import type { MigrationInterface, QueryRunner } from "typeorm";

export class ReelsM3CommissionsPayouts1712520000000 implements MigrationInterface {
  name = "ReelsM3CommissionsPayouts1712520000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Enum type
    await queryRunner.query(
      `CREATE TYPE "reel_commission_status" AS ENUM ('pending','earned','voided','paid_out')`,
    );

    // 2. Vendor program columns
    await queryRunner.query(
      `ALTER TABLE "vendors" ADD COLUMN "reels_program_joined_at" timestamptz NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendors" ADD COLUMN "reels_commission_rate" numeric(5,4) NOT NULL DEFAULT 0.0500`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendors" ADD COLUMN "reels_subsidy_ends_at" timestamptz NULL`,
    );

    // 3. reel_attributions — partitioned by RANGE on tapped_at
    await queryRunner.query(`
      CREATE TABLE "reel_attributions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id"),
        "reel_id" uuid NOT NULL REFERENCES "reels"("id"),
        "product_id" uuid NOT NULL REFERENCES "products"("id"),
        "creator_id" uuid NOT NULL REFERENCES "users"("id"),
        "tapped_at" timestamptz NOT NULL DEFAULT now(),
        "expires_at" timestamptz NOT NULL,
        "attribution_window_days_snapshot" int NOT NULL,
        "consumed_order_item_id" uuid NULL REFERENCES "order_items"("id"),
        PRIMARY KEY ("id", "tapped_at")
      ) PARTITION BY RANGE ("tapped_at")
    `);

    // 4. Three initial monthly partitions — current month + next 2
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    for (let i = 0; i < 3; i++) {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i + 1, 1));
      const suffix = `${start.getUTCFullYear()}${pad(start.getUTCMonth() + 1)}`;
      const startStr = `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-01`;
      const endStr = `${end.getUTCFullYear()}-${pad(end.getUTCMonth() + 1)}-01`;
      await queryRunner.query(`
        CREATE TABLE "reel_attributions_${suffix}" PARTITION OF "reel_attributions"
        FOR VALUES FROM ('${startStr}') TO ('${endStr}')
      `);
    }

    // DEFAULT partition is a safety net until the M4 partition-rolling job lands; rows that fall outside monthly partitions end up here.
    await queryRunner.query(`
      CREATE TABLE "reel_attributions_default" PARTITION OF "reel_attributions" DEFAULT
    `);

    // 5. Resolve index on parent (uses IMMUTABLE predicate — no now())
    await queryRunner.query(`
      CREATE INDEX "idx_reel_attributions_resolve"
      ON "reel_attributions" ("user_id", "product_id", "tapped_at" DESC)
      WHERE "consumed_order_item_id" IS NULL
    `);

    // 6. reel_commissions (not partitioned)
    await queryRunner.query(`
      CREATE TABLE "reel_commissions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "creator_id" uuid NOT NULL REFERENCES "users"("id"),
        "reel_id" uuid NOT NULL REFERENCES "reels"("id"),
        "attribution_id" uuid NOT NULL, -- no FK: parent is range-partitioned by tapped_at; integrity enforced at app layer
        "order_id" uuid NOT NULL REFERENCES "orders"("id"),
        "order_item_id" uuid NOT NULL REFERENCES "order_items"("id"),
        "vendor_id" uuid NOT NULL REFERENCES "vendors"("id"),
        "product_id" uuid NOT NULL REFERENCES "products"("id"),
        "item_price_fils" bigint NOT NULL,
        "commission_rate_snapshot" numeric(5,4) NOT NULL,
        "subsidy_share_snapshot" numeric(5,4) NOT NULL,
        "gross_commission_fils" bigint NOT NULL,
        "vendor_share_fils" bigint NOT NULL,
        "platform_subsidy_fils" bigint NOT NULL,
        "status" reel_commission_status NOT NULL DEFAULT 'pending',
        "eligible_at" timestamptz NULL,
        "earned_at" timestamptz NULL,
        "wallet_transaction_id" uuid NULL REFERENCES "wallet_transactions"("id"),
        "voided_reason" text NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_reel_commissions_order_item" UNIQUE ("order_item_id")
      )
    `);

    // 7. reel_commissions indexes
    await queryRunner.query(`
      CREATE INDEX "idx_reel_commissions_creator_status"
      ON "reel_commissions" ("creator_id", "status", "earned_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_reel_commissions_eligible"
      ON "reel_commissions" ("eligible_at")
      WHERE "status" = 'pending'
    `);

    // M3 configuration — defaults for the reels commerce loop; see spec §5.3
    // 8. Seed site_settings. The live unique index is partial:
    //    uq_site_settings_key_active UNIQUE (key) WHERE deleted_at IS NULL.
    //    Partial indexes can be used as ON CONFLICT inference targets if the
    //    index predicate is matched in the INSERT's WHERE-like clause.
    const seeds: Array<{ key: string; value: string; value_type: string }> = [
      { key: "reels_attribution_window_days", value: "7", value_type: "number" },
      { key: "reels_creator_base_rate", value: "0.0500", value_type: "number" },
      { key: "reels_subsidy_share", value: "0.5", value_type: "number" },
      { key: "reels_subsidy_window_months", value: "6", value_type: "number" },
      { key: "reels_payout_threshold_fils", value: "20000", value_type: "number" },
      { key: "reels_monthly_subsidy_cap_fils", value: "5000000", value_type: "number" },
    ];
    for (const s of seeds) {
      await queryRunner.query(
        `
        INSERT INTO "site_settings" ("key", "value", "value_type", "setting_group")
        VALUES ($1, $2, $3, 'reels')
        ON CONFLICT ("key") WHERE "deleted_at" IS NULL DO NOTHING
        `,
        [s.key, s.value, s.value_type],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove seeded settings
    await queryRunner.query(`
      DELETE FROM "site_settings"
      WHERE "key" IN (
        'reels_attribution_window_days',
        'reels_creator_base_rate',
        'reels_subsidy_share',
        'reels_subsidy_window_months',
        'reels_payout_threshold_fils',
        'reels_monthly_subsidy_cap_fils'
      )
    `);

    // Drop reel_commissions (and its indexes implicitly)
    await queryRunner.query(`DROP TABLE IF EXISTS "reel_commissions"`);

    // Drop reel_attributions — partitions drop automatically with the parent
    await queryRunner.query(`DROP TABLE IF EXISTS "reel_attributions"`);

    // Vendor columns
    await queryRunner.query(`ALTER TABLE "vendors" DROP COLUMN IF EXISTS "reels_subsidy_ends_at"`);
    await queryRunner.query(`ALTER TABLE "vendors" DROP COLUMN IF EXISTS "reels_commission_rate"`);
    await queryRunner.query(
      `ALTER TABLE "vendors" DROP COLUMN IF EXISTS "reels_program_joined_at"`,
    );

    // Enum type
    await queryRunner.query(`DROP TYPE IF EXISTS "reel_commission_status"`);
  }
}
