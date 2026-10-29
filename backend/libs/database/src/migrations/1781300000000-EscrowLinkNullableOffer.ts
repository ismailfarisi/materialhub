import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Generalize escrow holds + grants to link to EITHER a license offer OR a brief bid.
 * offer_id becomes nullable; bid_id is added; a CHECK enforces exactly one is set.
 */
export class EscrowLinkNullableOffer1781300000000 implements MigrationInterface {
  name = "EscrowLinkNullableOffer1781300000000";

  public async up(q: QueryRunner): Promise<void> {
    for (const t of ["reel_license_escrow_holds", "reel_license_grants"]) {
      await q.query(`ALTER TABLE "${t}" ALTER COLUMN "offer_id" DROP NOT NULL;`);
      await q.query(`ALTER TABLE "${t}" ADD COLUMN "bid_id" uuid;`);
      await q.query(
        `ALTER TABLE "${t}" ADD CONSTRAINT "fk_${t}_bid" FOREIGN KEY ("bid_id") REFERENCES "reel_brief_bids"("id") ON DELETE CASCADE;`,
      );
      await q.query(
        `ALTER TABLE "${t}" ADD CONSTRAINT "chk_${t}_link" CHECK (num_nonnulls("offer_id","bid_id") = 1);`,
      );
      await q.query(`CREATE INDEX "idx_${t}_bid" ON "${t}" ("bid_id") WHERE "bid_id" IS NOT NULL;`);
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const t of ["reel_license_escrow_holds", "reel_license_grants"]) {
      await q.query(`DROP INDEX IF EXISTS "idx_${t}_bid";`);
      await q.query(`ALTER TABLE "${t}" DROP CONSTRAINT IF EXISTS "chk_${t}_link";`);
      await q.query(`ALTER TABLE "${t}" DROP CONSTRAINT IF EXISTS "fk_${t}_bid";`);
      await q.query(`ALTER TABLE "${t}" DROP COLUMN IF EXISTS "bid_id";`);
      await q.query(`ALTER TABLE "${t}" ALTER COLUMN "offer_id" SET NOT NULL;`);
    }
  }
}
