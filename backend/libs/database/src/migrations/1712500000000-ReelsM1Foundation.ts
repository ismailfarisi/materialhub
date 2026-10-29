import type { MigrationInterface, QueryRunner } from "typeorm";

export class ReelsM1Foundation1712500000000 implements MigrationInterface {
  name = "ReelsM1Foundation1712500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enums
    await queryRunner.query(
      `CREATE TYPE "reel_status" AS ENUM ('draft', 'pending_review', 'approved', 'rejected', 'removed')`,
    );
    await queryRunner.query(
      `CREATE TYPE "reel_moderation_action" AS ENUM ('approved', 'rejected', 'removed', 'restored', 'flagged')`,
    );
    await queryRunner.query(
      `CREATE TYPE "reel_tagging_scope" AS ENUM ('any_product', 'specific_brand', 'specific_vendor', 'specific_products')`,
    );

    // reels
    await queryRunner.query(`
      CREATE TABLE "reels" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id"),
        "video_provider" text NOT NULL DEFAULT 'cloudflare_stream',
        "video_asset_id" text NOT NULL,
        "video_playback_url" text NOT NULL,
        "video_duration_seconds" int NOT NULL,
        "video_width" int NOT NULL,
        "video_height" int NOT NULL,
        "thumbnail_url" text NOT NULL,
        "caption" text,
        "language_code" text NOT NULL,
        "is_sponsored_disclosed" boolean NOT NULL DEFAULT false,
        "status" "reel_status" NOT NULL DEFAULT 'draft',
        "rejection_reason" text,
        "risk_score" numeric(5,4),
        "auto_flags" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "auto_review_result" text,
        "moderator_id" uuid REFERENCES "users"("id"),
        "moderated_at" timestamptz,
        "published_at" timestamptz,
        "like_count" int NOT NULL DEFAULT 0,
        "view_count" int NOT NULL DEFAULT 0,
        "save_count" int NOT NULL DEFAULT 0,
        "share_count" int NOT NULL DEFAULT 0,
        "unique_viewer_count" int NOT NULL DEFAULT 0,
        "ranking_score" numeric(12,4) NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "ck_reels_duration" CHECK ("video_duration_seconds" BETWEEN 3 AND 90),
        CONSTRAINT "ck_reels_caption_length" CHECK ("caption" IS NULL OR length("caption") <= 500),
        CONSTRAINT "ck_reels_language" CHECK ("language_code" IN ('ar','en','hi','ur','ml')),
        CONSTRAINT "ck_reels_portrait" CHECK ("video_height" >= "video_width")
      )
    `);

    // Partial indexes on reels
    await queryRunner.query(
      `CREATE INDEX "idx_reels_status_published" ON "reels" ("status", "published_at" DESC) WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_reels_user_published" ON "reels" ("user_id", "published_at" DESC) WHERE "status" = 'approved' AND "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_reels_pending_queue" ON "reels" ("created_at" ASC) WHERE "status" = 'pending_review' AND "deleted_at" IS NULL`,
    );

    // reel_product_tags
    await queryRunner.query(`
      CREATE TABLE "reel_product_tags" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "reel_id" uuid NOT NULL REFERENCES "reels"("id") ON DELETE CASCADE,
        "product_id" uuid NOT NULL REFERENCES "products"("id"),
        "variant_id" uuid REFERENCES "product_variants"("id"),
        "timestamp_seconds" numeric(6,2) NOT NULL,
        "display_x" numeric(5,4),
        "display_y" numeric(5,4),
        "tap_count" int NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_reel_product_tags_reel_product" UNIQUE ("reel_id", "product_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_reel_product_tags_product" ON "reel_product_tags" ("product_id")`,
    );

    // Tag limit trigger function
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION enforce_reel_tag_limit()
      RETURNS trigger AS $$
      BEGIN
        IF (SELECT COUNT(*) FROM "reel_product_tags" WHERE "reel_id" = NEW."reel_id") >= 5 THEN
          RAISE EXCEPTION 'reel_tag_limit_exceeded' USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await queryRunner.query(`
      CREATE TRIGGER "reel_product_tag_limit"
      BEFORE INSERT ON "reel_product_tags"
      FOR EACH ROW
      EXECUTE FUNCTION enforce_reel_tag_limit();
    `);

    // reel_moderation_log
    await queryRunner.query(`
      CREATE TABLE "reel_moderation_log" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "reel_id" uuid NOT NULL REFERENCES "reels"("id"),
        "moderator_id" uuid REFERENCES "users"("id"),
        "action" "reel_moderation_action" NOT NULL,
        "reason" text,
        "notes" text,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_moderation_log_reel" ON "reel_moderation_log" ("reel_id", "created_at" DESC)`,
    );

    // user_tagging_permissions
    await queryRunner.query(`
      CREATE TABLE "user_tagging_permissions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id"),
        "scope" "reel_tagging_scope" NOT NULL,
        "brand_id" uuid REFERENCES "brands"("id"),
        "vendor_id" uuid REFERENCES "vendors"("id"),
        "product_ids" uuid[],
        "granted_by" uuid NOT NULL REFERENCES "users"("id"),
        "granted_at" timestamptz NOT NULL DEFAULT now(),
        "expires_at" timestamptz,
        "reason" text,
        CONSTRAINT "ck_tagging_perm_scope" CHECK (
          (scope = 'any_product') OR
          (scope = 'specific_brand' AND brand_id IS NOT NULL) OR
          (scope = 'specific_vendor' AND vendor_id IS NOT NULL) OR
          (scope = 'specific_products' AND product_ids IS NOT NULL)
        )
      )
    `);
    // NOTE: Original plan specified a partial index with predicate
    // `WHERE expires_at IS NULL OR expires_at > now()`. Postgres requires
    // partial index predicates to be IMMUTABLE and now() is not immutable,
    // so the predicate is rejected. Using a plain index on (user_id) instead,
    // hence the name `idx_tagging_permissions_user` (not `_active`).
    await queryRunner.query(
      `CREATE INDEX "idx_tagging_permissions_user" ON "user_tagging_permissions" ("user_id")`,
    );

    // Add can_tag_unowned to users
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "can_tag_unowned" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "can_tag_unowned"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_tagging_permissions" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reel_moderation_log" CASCADE`);
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "reel_product_tag_limit" ON "reel_product_tags"`,
    );
    await queryRunner.query("DROP FUNCTION IF EXISTS enforce_reel_tag_limit()");
    await queryRunner.query(`DROP TABLE IF EXISTS "reel_product_tags" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reels" CASCADE`);
    await queryRunner.query(`DROP TYPE IF EXISTS "reel_tagging_scope"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "reel_moderation_action"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "reel_status"`);
  }
}
