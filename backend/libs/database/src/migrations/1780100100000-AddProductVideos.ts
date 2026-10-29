import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddProductVideos1780100100000 implements MigrationInterface {
  name = "AddProductVideos1780100100000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "product_videos" (
        "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "product_id"      uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
        "variant_id"      uuid NULL REFERENCES "product_variants"("id") ON DELETE SET NULL,
        "url"             varchar(1024) NOT NULL,
        "webm_url"        varchar(1024) NULL,
        "poster_url"      varchar(1024) NOT NULL,
        "duration_seconds" smallint NOT NULL CHECK ("duration_seconds" > 0 AND "duration_seconds" <= 30),
        "width"           integer NULL,
        "height"          integer NULL,
        "file_size"       integer NULL,
        "sort_order"      smallint NOT NULL DEFAULT 0,
        "mime_type"       varchar(50) NULL,
        "status"          varchar(16) NOT NULL DEFAULT 'processing'
                          CHECK ("status" IN ('processing', 'ready', 'failed')),
        "created_at"      timestamptz NOT NULL DEFAULT now(),
        "updated_at"      timestamptz NOT NULL DEFAULT now(),
        "deleted_at"      timestamptz NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_product_videos_product"
        ON "product_videos"("product_id")
        WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "product_videos"`);
  }
}
