import type { MigrationInterface, QueryRunner } from "typeorm";

export class ReelLicensingCounterOffers1781000000000 implements MigrationInterface {
  name = "ReelLicensingCounterOffers1781000000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "reel_license_offers" ADD COLUMN "countered_at" timestamptz;`);

    await q.query(`
      CREATE TABLE "reel_license_offer_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "offer_id" uuid NOT NULL,
        "actor" varchar(10) NOT NULL,
        "event_type" varchar(20) NOT NULL,
        "amount_fils_snapshot" bigint,
        "note" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_reel_license_offer_events" PRIMARY KEY ("id"),
        CONSTRAINT "fk_rloe_offer" FOREIGN KEY ("offer_id")
          REFERENCES "reel_license_offers"("id") ON DELETE CASCADE
      );`);
    await q.query(
      `CREATE INDEX "idx_rloe_offer_created" ON "reel_license_offer_events" ("offer_id","created_at");`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "reel_license_offer_events" CASCADE;`);
    await q.query(`ALTER TABLE "reel_license_offers" DROP COLUMN IF EXISTS "countered_at";`);
  }
}
