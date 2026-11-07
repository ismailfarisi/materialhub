import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Review reports become rows instead of an instant status flip: a single
 * buyer's flag used to hide an approved review immediately. `review_flags`
 * keeps one row per (review, reporter); the service hides the review only
 * once enough distinct buyers have reported it. Idempotent (IF NOT EXISTS) so
 * it can be applied ahead of the migration runner on a shared database.
 */
export class ReviewFlags1794100000004 implements MigrationInterface {
  name = "ReviewFlags1794100000004";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "review_flags" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "review_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "reason" character varying(500),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_review_flags_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_review_flags_review_user" UNIQUE ("review_id", "user_id"),
        CONSTRAINT "FK_review_flags_review" FOREIGN KEY ("review_id")
          REFERENCES "reviews"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_review_flags_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_review_flags_review" ON "review_flags" ("review_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "review_flags"`);
  }
}
