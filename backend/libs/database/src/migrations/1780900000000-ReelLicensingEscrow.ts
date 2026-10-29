import type { MigrationInterface, QueryRunner } from "typeorm";

export class ReelLicensingEscrow1780900000000 implements MigrationInterface {
  name = "ReelLicensingEscrow1780900000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "reel_license_offers" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "reel_id" uuid NOT NULL,
        "vendor_id" uuid NOT NULL,
        "creator_id" uuid NOT NULL,
        "amount_fils" bigint NOT NULL,
        "rights_scope" varchar(20) NOT NULL,
        "funding_source" varchar(20) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'pending_creator',
        "last_actor" varchar(10) NOT NULL DEFAULT 'vendor',
        "expires_at" timestamptz NOT NULL,
        "message" text,
        "completed_at" timestamptz, "declined_at" timestamptz, "cancelled_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_reel_license_offers" PRIMARY KEY ("id"),
        CONSTRAINT "fk_rlo_reel"   FOREIGN KEY ("reel_id")   REFERENCES "reels"("id")   ON DELETE CASCADE,
        CONSTRAINT "fk_rlo_vendor" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_rlo_creator" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE CASCADE
      );`);
    await q.query(
      `CREATE INDEX "idx_rlo_creator_status" ON "reel_license_offers" ("creator_id","status") WHERE "deleted_at" IS NULL;`,
    );
    await q.query(
      `CREATE INDEX "idx_rlo_vendor_status"  ON "reel_license_offers" ("vendor_id","status")  WHERE "deleted_at" IS NULL;`,
    );
    await q.query(
      `CREATE INDEX "idx_rlo_expiry" ON "reel_license_offers" ("status","expires_at") WHERE "deleted_at" IS NULL;`,
    );

    await q.query(`
      CREATE TABLE "reel_license_escrow_holds" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "offer_id" uuid NOT NULL,
        "vendor_id" uuid NOT NULL,
        "funding_source" varchar(20) NOT NULL,
        "amount_fils" bigint NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'held',
        "stripe_payment_intent_id" text,
        "idempotency_key" text NOT NULL,
        "settled_payout_id" uuid,
        "captured_at" timestamptz, "released_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_reel_license_escrow_holds" PRIMARY KEY ("id"),
        CONSTRAINT "fk_rleh_offer" FOREIGN KEY ("offer_id") REFERENCES "reel_license_offers"("id") ON DELETE CASCADE
      );`);
    await q.query(
      `CREATE UNIQUE INDEX "uq_rleh_idem" ON "reel_license_escrow_holds" ("idempotency_key");`,
    );
    await q.query(`CREATE INDEX "idx_rleh_vendor_payout_active" ON "reel_license_escrow_holds" ("vendor_id")
                   WHERE "funding_source" = 'payout_balance' AND "status" IN ('held','captured') AND "deleted_at" IS NULL;`);

    await q.query(`
      CREATE TABLE "reel_license_grants" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "offer_id" uuid NOT NULL,
        "reel_id" uuid NOT NULL,
        "vendor_id" uuid NOT NULL,
        "creator_id" uuid NOT NULL,
        "scope" varchar(20) NOT NULL,
        "gross_fils" bigint NOT NULL,
        "platform_fee_fils" bigint NOT NULL,
        "creator_net_fils" bigint NOT NULL,
        "fee_rate_snapshot" numeric(5,4) NOT NULL,
        "wallet_transaction_id" uuid,
        "terms_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "expires_at" timestamptz, "revoked_at" timestamptz,
        "granted_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_reel_license_grants" PRIMARY KEY ("id"),
        CONSTRAINT "uq_rlg_offer" UNIQUE ("offer_id"),
        CONSTRAINT "fk_rlg_offer" FOREIGN KEY ("offer_id") REFERENCES "reel_license_offers"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_rlg_reel"  FOREIGN KEY ("reel_id")  REFERENCES "reels"("id")  ON DELETE CASCADE,
        CONSTRAINT "fk_rlg_vendor" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_rlg_creator" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE CASCADE
      );`);
    await q.query(
      `CREATE INDEX "idx_rlg_vendor" ON "reel_license_grants" ("vendor_id") WHERE "deleted_at" IS NULL;`,
    );
    await q.query(
      `CREATE INDEX "idx_rlg_creator" ON "reel_license_grants" ("creator_id") WHERE "deleted_at" IS NULL;`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "reel_license_grants" CASCADE;`);
    await q.query(`DROP TABLE IF EXISTS "reel_license_escrow_holds" CASCADE;`);
    await q.query(`DROP TABLE IF EXISTS "reel_license_offers" CASCADE;`);
  }
}
