import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateCreatorMediaKits1786000000000 implements MigrationInterface {
  name = "CreateCreatorMediaKits1786000000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "creator_media_kits" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "headline" varchar(120),
        "pull_quote" varchar(160),
        "about" text,
        "location_label" varchar(120),
        "stats" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "content_types" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "audience" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "top_locations" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "collaboration_note" text,
        "is_published" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_creator_media_kits" PRIMARY KEY ("id"),
        CONSTRAINT "fk_creator_media_kit_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        -- The list caps are enforced in the service too; these are the DB-level
        -- backstop against a kit growing unbounded through a future writer.
        CONSTRAINT "ck_media_kit_stats_len" CHECK (jsonb_array_length("stats") <= 4),
        CONSTRAINT "ck_media_kit_content_types_len" CHECK (jsonb_array_length("content_types") <= 8),
        CONSTRAINT "ck_media_kit_audience_len" CHECK (jsonb_array_length("audience") <= 6),
        CONSTRAINT "ck_media_kit_locations_len" CHECK (jsonb_array_length("top_locations") <= 6)
      );`);

    // One live kit per creator — the service upserts against this.
    await q.query(
      `CREATE UNIQUE INDEX "uq_media_kit_per_user" ON "creator_media_kits" ("user_id")
         WHERE "deleted_at" IS NULL;`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "creator_media_kits" CASCADE;`);
  }
}
