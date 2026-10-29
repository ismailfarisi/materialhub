import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Third `DealLink` arm: escrow holds and grants may now link to a collab
 * application, alongside license offers and brief bids.
 *
 * The existing constraint is `num_nonnulls("offer_id","bid_id") = 1`, which
 * already means EXACTLY one — widening it to three columns keeps that property
 * for free. (Writing it as `a IS NOT NULL OR b IS NOT NULL OR c IS NOT NULL`
 * would admit rows with two arms set; `num_nonnulls` does not.)
 *
 * Backfill is a no-op: every existing row has exactly one of offer_id/bid_id
 * set, so it already satisfies the widened constraint.
 */
export class EscrowLinkCollabApplication1785800000000 implements MigrationInterface {
  name = "EscrowLinkCollabApplication1785800000000";

  public async up(q: QueryRunner): Promise<void> {
    for (const t of ["reel_license_escrow_holds", "reel_license_grants"]) {
      await q.query(`ALTER TABLE "${t}" ADD COLUMN "collab_application_id" uuid;`);
      await q.query(
        `ALTER TABLE "${t}" ADD CONSTRAINT "fk_${t}_collab_app" FOREIGN KEY ("collab_application_id") REFERENCES "collab_applications"("id") ON DELETE CASCADE;`,
      );
      await q.query(`ALTER TABLE "${t}" DROP CONSTRAINT "chk_${t}_link";`);
      await q.query(
        `ALTER TABLE "${t}" ADD CONSTRAINT "chk_${t}_link" CHECK (num_nonnulls("offer_id","bid_id","collab_application_id") = 1);`,
      );
      await q.query(
        `CREATE INDEX "idx_${t}_collab_app" ON "${t}" ("collab_application_id") WHERE "collab_application_id" IS NOT NULL;`,
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const t of ["reel_license_escrow_holds", "reel_license_grants"]) {
      // Order matters: the column must be gone BEFORE the two-arm constraint is
      // restored. Re-adding it first would evaluate num_nonnulls("offer_id","bid_id")
      // against collab-linked rows, which have neither set, and fail.
      // (A down-migration still cannot succeed while collab-linked rows exist —
      // they would have zero arms under the restored constraint. Drop them first.)
      await q.query(`DROP INDEX IF EXISTS "idx_${t}_collab_app";`);
      await q.query(`ALTER TABLE "${t}" DROP CONSTRAINT IF EXISTS "chk_${t}_link";`);
      await q.query(`ALTER TABLE "${t}" DROP CONSTRAINT IF EXISTS "fk_${t}_collab_app";`);
      await q.query(`ALTER TABLE "${t}" DROP COLUMN IF EXISTS "collab_application_id";`);
      await q.query(
        `ALTER TABLE "${t}" ADD CONSTRAINT "chk_${t}_link" CHECK (num_nonnulls("offer_id","bid_id") = 1);`,
      );
    }
  }
}
