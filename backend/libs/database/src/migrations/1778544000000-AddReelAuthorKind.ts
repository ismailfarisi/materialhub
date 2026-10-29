import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddReelAuthorKind1778544000000 implements MigrationInterface {
  name = "AddReelAuthorKind1778544000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "reel_author_kind" AS ENUM ('creator', 'customer', 'house')`,
    );

    await queryRunner.query(`
      ALTER TABLE "reels"
        ADD COLUMN "author_kind" "reel_author_kind" NOT NULL DEFAULT 'customer',
        ADD COLUMN "is_verified_buyer" boolean NOT NULL DEFAULT false
    `);

    // Backfill author_kind from user.creator_tier for any pre-existing reels.
    // 'house' is not auto-assigned — admins can override via moderation later.
    await queryRunner.query(`
      UPDATE "reels" r SET "author_kind" =
        CASE
          WHEN u."creator_tier" IN ('creator', 'influencer') THEN 'creator'::reel_author_kind
          ELSE 'customer'::reel_author_kind
        END
      FROM "users" u
      WHERE u."id" = r."user_id"
        AND r."deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_reels_author_kind_status_published"
        ON "reels" ("author_kind", "status", "published_at" DESC)
        WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_reels_author_kind_status_published"`);

    await queryRunner.query(`
      ALTER TABLE "reels"
        DROP COLUMN IF EXISTS "is_verified_buyer",
        DROP COLUMN IF EXISTS "author_kind"
    `);

    await queryRunner.query(`DROP TYPE IF EXISTS "reel_author_kind"`);
  }
}
