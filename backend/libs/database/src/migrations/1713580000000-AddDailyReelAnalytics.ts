import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddDailyReelAnalytics1713580000000 implements MigrationInterface {
  name = "AddDailyReelAnalytics1713580000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "daily_reel_metrics" (
        "reel_id"                UUID        NOT NULL REFERENCES "reels"("id") ON DELETE CASCADE,
        "bucket_date"            DATE        NOT NULL,
        "impressions"            INT         NOT NULL DEFAULT 0,
        "unique_viewers"         INT         NOT NULL DEFAULT 0,
        "likes"                  INT         NOT NULL DEFAULT 0,
        "saves"                  INT         NOT NULL DEFAULT 0,
        "shares"                 INT         NOT NULL DEFAULT 0,
        "product_taps"           INT         NOT NULL DEFAULT 0,
        "attributed_orders"      INT         NOT NULL DEFAULT 0,
        "attributed_gmv_fils"    BIGINT      NOT NULL DEFAULT 0,
        "earned_commission_fils" BIGINT      NOT NULL DEFAULT 0,
        "created_at"             TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"             TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY ("reel_id", "bucket_date")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_drm_bucket_date" ON "daily_reel_metrics" ("bucket_date" DESC)`,
    );

    await queryRunner.query(`
      CREATE TABLE "daily_creator_metrics" (
        "creator_id"             UUID        NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "bucket_date"            DATE        NOT NULL,
        "reel_count"             INT         NOT NULL DEFAULT 0,
        "impressions"            INT         NOT NULL DEFAULT 0,
        "unique_viewers"         INT         NOT NULL DEFAULT 0,
        "engagement_events"      INT         NOT NULL DEFAULT 0,
        "attributed_orders"      INT         NOT NULL DEFAULT 0,
        "attributed_gmv_fils"    BIGINT      NOT NULL DEFAULT 0,
        "earned_commission_fils" BIGINT      NOT NULL DEFAULT 0,
        "created_at"             TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"             TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY ("creator_id", "bucket_date")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_dcm_bucket_date" ON "daily_creator_metrics" ("bucket_date" DESC)`,
    );

    await queryRunner.query(`
      CREATE TABLE "daily_vendor_reel_metrics" (
        "vendor_id"              UUID        NOT NULL REFERENCES "vendors"("id") ON DELETE CASCADE,
        "bucket_date"            DATE        NOT NULL,
        "reel_count"             INT         NOT NULL DEFAULT 0,
        "impressions"            INT         NOT NULL DEFAULT 0,
        "product_taps"           INT         NOT NULL DEFAULT 0,
        "attributed_orders"      INT         NOT NULL DEFAULT 0,
        "attributed_gmv_fils"    BIGINT      NOT NULL DEFAULT 0,
        "created_at"             TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"             TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY ("vendor_id", "bucket_date")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_dvrm_bucket_date" ON "daily_vendor_reel_metrics" ("bucket_date" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "daily_vendor_reel_metrics"`);
    await queryRunner.query(`DROP TABLE "daily_creator_metrics"`);
    await queryRunner.query(`DROP TABLE "daily_reel_metrics"`);
  }
}
