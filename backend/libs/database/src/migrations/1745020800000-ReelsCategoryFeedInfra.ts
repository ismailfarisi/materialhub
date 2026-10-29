import type { MigrationInterface, QueryRunner } from "typeorm";

export class ReelsCategoryFeedInfra1745020800000 implements MigrationInterface {
  name = "ReelsCategoryFeedInfra1745020800000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_categories_path_prefix"
        ON "categories" ("path" varchar_pattern_ops)
        WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "reel_hot_categories" (
        "category_id"        uuid         NOT NULL,
        "language_code"      varchar(5)   NOT NULL,
        "country_code"       varchar(2)   NOT NULL,
        "reel_count_30d"     integer      NOT NULL DEFAULT 0,
        "last_recomputed_at" timestamptz  NOT NULL DEFAULT now(),
        PRIMARY KEY ("category_id", "language_code", "country_code"),
        CONSTRAINT "fk_rhc_category"
          FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_rhc_last_recomputed"
        ON "reel_hot_categories" ("last_recomputed_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_rhc_last_recomputed"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reel_hot_categories"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_categories_path_prefix"`);
  }
}
