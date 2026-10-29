import type { MigrationInterface, QueryRunner } from "typeorm";

export class ReelsM2FeedSocial1712510000000 implements MigrationInterface {
  name = "ReelsM2FeedSocial1712510000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // users counters
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "follower_count" int NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "following_count" int NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "published_reel_count" int NOT NULL DEFAULT 0`,
    );

    // reel_views
    await queryRunner.query(`
      CREATE TABLE "reel_views" (
        "user_id" uuid NOT NULL REFERENCES "users"("id"),
        "reel_id" uuid NOT NULL REFERENCES "reels"("id") ON DELETE CASCADE,
        "viewed_at" timestamptz NOT NULL DEFAULT now(),
        "watch_duration_seconds" numeric(6,2) NOT NULL,
        "completion_percentage" numeric(5,4) NOT NULL,
        "device_type" text,
        PRIMARY KEY ("user_id", "reel_id"),
        CONSTRAINT "ck_reel_views_pct" CHECK ("completion_percentage" BETWEEN 0 AND 1)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_reel_views_user_recent" ON "reel_views" ("user_id", "viewed_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_reel_views_user_seen" ON "reel_views" ("user_id") WHERE "completion_percentage" >= 0.5`,
    );

    // reel_likes
    await queryRunner.query(`
      CREATE TABLE "reel_likes" (
        "reel_id" uuid NOT NULL REFERENCES "reels"("id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("id"),
        "liked_at" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("reel_id", "user_id")
      )
    `);

    // reel_saves
    await queryRunner.query(`
      CREATE TABLE "reel_saves" (
        "user_id" uuid NOT NULL REFERENCES "users"("id"),
        "reel_id" uuid NOT NULL REFERENCES "reels"("id") ON DELETE CASCADE,
        "saved_at" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("user_id", "reel_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_reel_saves_user_recent" ON "reel_saves" ("user_id", "saved_at" DESC)`,
    );

    // user_follows
    await queryRunner.query(`
      CREATE TABLE "user_follows" (
        "follower_id" uuid NOT NULL REFERENCES "users"("id"),
        "followee_id" uuid NOT NULL REFERENCES "users"("id"),
        "followed_at" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("follower_id", "followee_id"),
        CONSTRAINT "ck_user_follows_self" CHECK ("follower_id" <> "followee_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_user_follows_followee" ON "user_follows" ("followee_id", "followed_at" DESC)`,
    );

    // Triggers to maintain denormalized counters
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION trg_user_follows_count() RETURNS trigger AS $$
      BEGIN
        IF (TG_OP = 'INSERT') THEN
          UPDATE users SET follower_count = follower_count + 1 WHERE id = NEW.followee_id;
          UPDATE users SET following_count = following_count + 1 WHERE id = NEW.follower_id;
        ELSIF (TG_OP = 'DELETE') THEN
          UPDATE users SET follower_count = greatest(follower_count - 1, 0) WHERE id = OLD.followee_id;
          UPDATE users SET following_count = greatest(following_count - 1, 0) WHERE id = OLD.follower_id;
        END IF;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await queryRunner.query(`
      CREATE TRIGGER user_follows_count_trigger
      AFTER INSERT OR DELETE ON "user_follows"
      FOR EACH ROW EXECUTE FUNCTION trg_user_follows_count();
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION trg_reel_likes_count() RETURNS trigger AS $$
      BEGIN
        IF (TG_OP = 'INSERT') THEN
          UPDATE reels SET like_count = like_count + 1 WHERE id = NEW.reel_id;
        ELSIF (TG_OP = 'DELETE') THEN
          UPDATE reels SET like_count = greatest(like_count - 1, 0) WHERE id = OLD.reel_id;
        END IF;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await queryRunner.query(`
      CREATE TRIGGER reel_likes_count_trigger
      AFTER INSERT OR DELETE ON "reel_likes"
      FOR EACH ROW EXECUTE FUNCTION trg_reel_likes_count();
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION trg_reel_saves_count() RETURNS trigger AS $$
      BEGIN
        IF (TG_OP = 'INSERT') THEN
          UPDATE reels SET save_count = save_count + 1 WHERE id = NEW.reel_id;
        ELSIF (TG_OP = 'DELETE') THEN
          UPDATE reels SET save_count = greatest(save_count - 1, 0) WHERE id = OLD.reel_id;
        END IF;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await queryRunner.query(`
      CREATE TRIGGER reel_saves_count_trigger
      AFTER INSERT OR DELETE ON "reel_saves"
      FOR EACH ROW EXECUTE FUNCTION trg_reel_saves_count();
    `);

    // Increment users.published_reel_count when a reel is approved
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION trg_reel_published_count() RETURNS trigger AS $$
      BEGIN
        IF (TG_OP = 'UPDATE' AND OLD.status <> 'approved' AND NEW.status = 'approved') THEN
          UPDATE users SET published_reel_count = published_reel_count + 1 WHERE id = NEW.user_id;
        ELSIF (TG_OP = 'UPDATE' AND OLD.status = 'approved' AND NEW.status <> 'approved') THEN
          UPDATE users SET published_reel_count = greatest(published_reel_count - 1, 0) WHERE id = NEW.user_id;
        END IF;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await queryRunner.query(`
      CREATE TRIGGER reel_published_count_trigger
      AFTER UPDATE OF status ON "reels"
      FOR EACH ROW EXECUTE FUNCTION trg_reel_published_count();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS reel_published_count_trigger ON "reels"`);
    await queryRunner.query("DROP FUNCTION IF EXISTS trg_reel_published_count()");
    await queryRunner.query(`DROP TRIGGER IF EXISTS reel_saves_count_trigger ON "reel_saves"`);
    await queryRunner.query("DROP FUNCTION IF EXISTS trg_reel_saves_count()");
    await queryRunner.query(`DROP TRIGGER IF EXISTS reel_likes_count_trigger ON "reel_likes"`);
    await queryRunner.query("DROP FUNCTION IF EXISTS trg_reel_likes_count()");
    await queryRunner.query(`DROP TRIGGER IF EXISTS user_follows_count_trigger ON "user_follows"`);
    await queryRunner.query("DROP FUNCTION IF EXISTS trg_user_follows_count()");
    await queryRunner.query(`DROP TABLE IF EXISTS "user_follows"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reel_saves"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reel_likes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reel_views"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "published_reel_count"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "following_count"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "follower_count"`);
  }
}
