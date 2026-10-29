import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateCreatorPortfolioVideos1785900000000 implements MigrationInterface {
  name = "CreateCreatorPortfolioVideos1785900000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "creator_portfolio_videos" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "kind" varchar(10) NOT NULL,
        "video_url" text NOT NULL,
        "content_type" varchar(50) NOT NULL,
        "caption" varchar(255),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_creator_portfolio_videos" PRIMARY KEY ("id"),
        CONSTRAINT "fk_creator_portfolio_video_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      );`);

    // At most one live intro video per user. The service enforces
    // "replace" semantics (delete the old row before inserting the new
    // one); this index is the DB-level backstop, mirroring
    // uq_creator_app_open_per_user.
    await q.query(
      `CREATE UNIQUE INDEX "uq_portfolio_intro_per_user" ON "creator_portfolio_videos" ("user_id")
         WHERE "kind" = 'intro' AND "deleted_at" IS NULL;`,
    );
    // Drives the list query (samples in upload order).
    await q.query(
      `CREATE INDEX "idx_portfolio_user_kind" ON "creator_portfolio_videos" ("user_id","kind","created_at")
         WHERE "deleted_at" IS NULL;`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "creator_portfolio_videos" CASCADE;`);
  }
}
