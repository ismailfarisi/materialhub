import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddLayoutBackgroundVideos1780600100000 implements MigrationInterface {
  name = "AddLayoutBackgroundVideos1780600100000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "product_videos" ALTER COLUMN "product_id" DROP NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "product_videos" ADD COLUMN "asset_type" varchar(32) NOT NULL DEFAULT 'product'`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_videos" ADD COLUMN "vendor_id" uuid NULL
         REFERENCES "vendors"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(`
      ALTER TABLE "product_videos" ADD CONSTRAINT "chk_product_videos_owner" CHECK (
        ("asset_type" = 'product'           AND "product_id" IS NOT NULL) OR
        ("asset_type" = 'layout_background' AND "product_id" IS NULL)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_product_videos_layout_vendor"
        ON "product_videos"("vendor_id")
        WHERE "asset_type" = 'layout_background' AND "deleted_at" IS NULL
    `);
  }

  /**
   * Destructive and NOT self-cleaning. Reverting hard-deletes every
   * `layout_background` row, which:
   *  - orphans the transcoded MP4 and poster objects in S3 (nothing else
   *    references them, so they are never reaped), and
   *  - leaves `data.video` pointing at those URLs inside already-published
   *    `layout_sections.blocks` JSONB, which this migration does not touch.
   * The storefront degrades safely (the banner image is always rendered and is
   * the video's poster), but the JSONB must be cleaned up by hand if the
   * feature is being removed permanently rather than rolled back briefly.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_product_videos_layout_vendor"`);
    await queryRunner.query(
      `ALTER TABLE "product_videos" DROP CONSTRAINT IF EXISTS "chk_product_videos_owner"`,
    );
    await queryRunner.query(
      `DELETE FROM "product_videos" WHERE "asset_type" = 'layout_background'`,
    );
    await queryRunner.query(`ALTER TABLE "product_videos" DROP COLUMN IF EXISTS "vendor_id"`);
    await queryRunner.query(`ALTER TABLE "product_videos" DROP COLUMN IF EXISTS "asset_type"`);
    await queryRunner.query(`ALTER TABLE "product_videos" ALTER COLUMN "product_id" SET NOT NULL`);
  }
}
