import type { MigrationInterface, QueryRunner } from "typeorm";

export class ReelsM4CreatorTier1712530000000 implements MigrationInterface {
  name = "ReelsM4CreatorTier1712530000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Enum type
    await queryRunner.query(
      `CREATE TYPE "creator_tier" AS ENUM ('regular','creator','influencer')`,
    );

    // 2. User columns
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "creator_tier" "creator_tier" NOT NULL DEFAULT 'regular'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "creator_tier_earned_at" timestamptz NULL`,
    );

    // 3. Partial index — predicate is IMMUTABLE (literal enum comparison), so Postgres accepts it.
    //    We use a partial index because the vast majority of users stay at 'regular'; this keeps
    //    the index small and only scans non-regular tiers (admin veto queries, leaderboards).
    await queryRunner.query(`
      CREATE INDEX "idx_users_creator_tier"
      ON "users" ("creator_tier")
      WHERE "creator_tier" != 'regular'
    `);

    // 4. Auto-graduation trigger function. Reads thresholds from site_settings (seeded below)
    //    so ops can tune without a migration. The `IF NEW.creator_tier = 'regular'` guard is
    //    CRITICAL — without it, every follower_count bump on an already-graduated user would
    //    reset creator_tier_earned_at, and churn audit history.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION trg_auto_graduate_creator() RETURNS trigger AS $$
      DECLARE
        threshold_followers int;
        threshold_reels int;
      BEGIN
        IF NEW.creator_tier = 'regular' THEN
          SELECT (value::int) INTO threshold_followers FROM site_settings WHERE key = 'reels_graduation_follower_count' AND deleted_at IS NULL;
          SELECT (value::int) INTO threshold_reels FROM site_settings WHERE key = 'reels_graduation_approved_reel_count' AND deleted_at IS NULL;
          threshold_followers := COALESCE(threshold_followers, 500);
          threshold_reels := COALESCE(threshold_reels, 5);
          IF NEW.follower_count >= threshold_followers OR NEW.published_reel_count >= threshold_reels THEN
            NEW.creator_tier := 'creator';
            NEW.creator_tier_earned_at := now();
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // 5. Trigger — BEFORE UPDATE OF narrow column list so we only fire on counter mutations.
    await queryRunner.query(`
      CREATE TRIGGER user_auto_graduate_trigger
      BEFORE UPDATE OF follower_count, published_reel_count ON "users"
      FOR EACH ROW EXECUTE FUNCTION trg_auto_graduate_creator()
    `);

    // 6. Seed site_settings. Mirrors M3's pattern — partial unique index on (key) WHERE deleted_at IS NULL
    //    allows ON CONFLICT inference via matching predicate.
    const seeds: Array<{ key: string; value: string; value_type: string }> = [
      { key: "reels_graduation_follower_count", value: "500", value_type: "number" },
      { key: "reels_graduation_approved_reel_count", value: "5", value_type: "number" },
      { key: "reels_admin_veto_window_hours", value: "48", value_type: "number" },
      { key: "reels_view_history_cap", value: "500", value_type: "number" },
      { key: "reels_view_history_retention_days", value: "90", value_type: "number" },
      { key: "reels_nudge_enabled", value: "true", value_type: "boolean" },
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
        'reels_graduation_follower_count',
        'reels_graduation_approved_reel_count',
        'reels_admin_veto_window_hours',
        'reels_view_history_cap',
        'reels_view_history_retention_days',
        'reels_nudge_enabled'
      )
    `);

    // Drop trigger, then function
    await queryRunner.query(`DROP TRIGGER IF EXISTS "user_auto_graduate_trigger" ON "users"`);
    await queryRunner.query("DROP FUNCTION IF EXISTS trg_auto_graduate_creator()");

    // Drop index
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_creator_tier"`);

    // Drop columns
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "creator_tier_earned_at"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "creator_tier"`);

    // Enum type
    await queryRunner.query(`DROP TYPE IF EXISTS "creator_tier"`);
  }
}
