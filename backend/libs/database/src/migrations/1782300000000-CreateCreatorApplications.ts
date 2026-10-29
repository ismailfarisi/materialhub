import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateCreatorApplications1782300000000 implements MigrationInterface {
  name = "CreateCreatorApplications1782300000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "creator_applications" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "status" varchar(12) NOT NULL DEFAULT 'pending',
        "display_name" varchar(120) NOT NULL,
        "bio" text NOT NULL,
        "primary_category" varchar(100) NOT NULL,
        "social_links" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "follower_estimate" integer,
        "sample_urls" jsonb,
        "motivation" text,
        "agreed_to_terms_at" timestamptz NOT NULL,
        "reviewed_by" uuid,
        "review_notes" text,
        "submitted_at" timestamptz NOT NULL DEFAULT now(),
        "reviewed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_creator_applications" PRIMARY KEY ("id"),
        CONSTRAINT "fk_creator_app_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      );`);

    // One OPEN application per user (pending|needs_info), respecting soft delete.
    await q.query(
      `CREATE UNIQUE INDEX "uq_creator_app_open_per_user" ON "creator_applications" ("user_id")
         WHERE "deleted_at" IS NULL AND "status" IN ('pending','needs_info');`,
    );
    // Admin queue: filter by status, newest-submitted first.
    await q.query(
      `CREATE INDEX "idx_creator_app_status_submitted" ON "creator_applications" ("status","submitted_at")
         WHERE "deleted_at" IS NULL;`,
    );
    // Applicant "my latest application" lookup.
    await q.query(
      `CREATE INDEX "idx_creator_app_user" ON "creator_applications" ("user_id")
         WHERE "deleted_at" IS NULL;`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "creator_applications" CASCADE;`);
  }
}
