import type { MigrationInterface, QueryRunner } from "typeorm";

export class ReelAnonymousAttribution1745280000000 implements MigrationInterface {
  name = "ReelAnonymousAttribution1745280000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    // reel_attributions: allow anonymous rows, add session_id FK and resolve index
    await queryRunner.query(`
      ALTER TABLE "reel_attributions"
        ADD COLUMN "session_id" uuid NULL
          REFERENCES "guest_sessions"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "reel_attributions"
        ALTER COLUMN "user_id" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "reel_attributions"
        ADD CONSTRAINT "ck_reel_attributions_user_or_session"
        CHECK ("user_id" IS NOT NULL OR "session_id" IS NOT NULL)
    `);
    // Supports the merge UPDATE's WHERE predicate and never-matched-yet attribution lookups.
    await queryRunner.query(`
      CREATE INDEX "idx_reel_attributions_session"
        ON "reel_attributions" ("session_id", "product_id", "tapped_at" DESC)
        WHERE "consumed_order_item_id" IS NULL AND "user_id" IS NULL
    `);

    // reel_views: add surrogate id PK, make user_id nullable, add session_id.
    // Preserves dedup via two partial UNIQUE indexes (user + session).
    await queryRunner.query(`
      ALTER TABLE "reel_views"
        ADD COLUMN "id" uuid NOT NULL DEFAULT gen_random_uuid()
    `);
    await queryRunner.query(`
      ALTER TABLE "reel_views" DROP CONSTRAINT "reel_views_pkey"
    `);
    await queryRunner.query(`
      ALTER TABLE "reel_views" ADD PRIMARY KEY ("id")
    `);
    await queryRunner.query(`
      ALTER TABLE "reel_views"
        ADD COLUMN "session_id" uuid NULL
          REFERENCES "guest_sessions"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "reel_views"
        ALTER COLUMN "user_id" DROP NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_reel_views_user_reel"
        ON "reel_views" ("user_id", "reel_id")
        WHERE "user_id" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_reel_views_session_reel"
        ON "reel_views" ("session_id", "reel_id")
        WHERE "user_id" IS NULL AND "session_id" IS NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "reel_views"
        ADD CONSTRAINT "ck_reel_views_user_or_session"
        CHECK ("user_id" IS NOT NULL OR "session_id" IS NOT NULL)
    `);

    // Narrow pre-existing user-keyed indexes so anonymous rows (user_id IS NULL) do not
    // bloat hot write-path indexes. Done here (before anonymous writes land) so no
    // REINDEX CONCURRENTLY is ever needed against a live table with anonymous data.
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_reel_views_user_recent"`);
    await queryRunner.query(`
      CREATE INDEX "idx_reel_views_user_recent"
        ON "reel_views" ("user_id", "viewed_at" DESC)
        WHERE "user_id" IS NOT NULL
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_reel_views_user_seen"`);
    await queryRunner.query(`
      CREATE INDEX "idx_reel_views_user_seen"
        ON "reel_views" ("user_id")
        WHERE "completion_percentage" >= 0.5 AND "user_id" IS NOT NULL
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_reel_attributions_resolve"`);
    await queryRunner.query(`
      CREATE INDEX "idx_reel_attributions_resolve"
        ON "reel_attributions" ("user_id", "product_id", "tapped_at" DESC)
        WHERE "consumed_order_item_id" IS NULL AND "user_id" IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Restore pre-existing user-keyed indexes to their original (broader) predicates.
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_reel_attributions_resolve"`);
    await queryRunner.query(`
      CREATE INDEX "idx_reel_attributions_resolve"
        ON "reel_attributions" ("user_id", "product_id", "tapped_at" DESC)
        WHERE "consumed_order_item_id" IS NULL
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_reel_views_user_seen"`);
    await queryRunner.query(`
      CREATE INDEX "idx_reel_views_user_seen"
        ON "reel_views" ("user_id")
        WHERE "completion_percentage" >= 0.5
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_reel_views_user_recent"`);
    await queryRunner.query(`
      CREATE INDEX "idx_reel_views_user_recent"
        ON "reel_views" ("user_id", "viewed_at" DESC)
    `);

    // reel_views: reverse order. Same anonymous-row safety check.
    const anonViewCount = await queryRunner.query(`
      SELECT COUNT(*)::int AS n FROM "reel_views" WHERE "user_id" IS NULL
    `);
    if (anonViewCount[0]?.n > 0) {
      throw new Error(
        `Cannot reverse: ${anonViewCount[0].n} anonymous reel_views rows exist. Delete or reassign them before rolling back.`,
      );
    }
    await queryRunner.query(`
      ALTER TABLE "reel_views"
        DROP CONSTRAINT IF EXISTS "ck_reel_views_user_or_session"
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_reel_views_session_reel"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_reel_views_user_reel"`);
    await queryRunner.query(`
      ALTER TABLE "reel_views" ALTER COLUMN "user_id" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "reel_views" DROP COLUMN "session_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "reel_views" DROP CONSTRAINT "reel_views_pkey"
    `);
    await queryRunner.query(`
      ALTER TABLE "reel_views" ADD PRIMARY KEY ("user_id", "reel_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "reel_views" DROP COLUMN "id"
    `);

    // reel_attributions: reverse order.
    // Fail loudly rather than silently drop anonymous rows — operator must
    // decide what to do with them before reversal.
    const anonCount = await queryRunner.query(`
      SELECT COUNT(*)::int AS n FROM "reel_attributions" WHERE "user_id" IS NULL
    `);
    if (anonCount[0]?.n > 0) {
      throw new Error(
        `Cannot reverse: ${anonCount[0].n} anonymous reel_attributions rows exist. Delete or reassign them before rolling back.`,
      );
    }
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_reel_attributions_session"`);
    await queryRunner.query(`
      ALTER TABLE "reel_attributions"
        DROP CONSTRAINT IF EXISTS "ck_reel_attributions_user_or_session"
    `);
    await queryRunner.query(`
      ALTER TABLE "reel_attributions"
        ALTER COLUMN "user_id" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "reel_attributions" DROP COLUMN "session_id"
    `);
  }
}
