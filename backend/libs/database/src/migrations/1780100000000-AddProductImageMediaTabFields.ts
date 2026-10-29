import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddProductImageMediaTabFields1780100000000 implements MigrationInterface {
  name = "AddProductImageMediaTabFields1780100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_images"
        ADD COLUMN "focal_x" numeric(4,3) NULL,
        ADD COLUMN "focal_y" numeric(4,3) NULL,
        ADD COLUMN "ai_source_image_id" uuid NULL
          REFERENCES "product_images"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_product_images_ai_source"
        ON "product_images"("ai_source_image_id")
        WHERE "ai_source_image_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_product_images_ai_source"`);
    await queryRunner.query(`
      ALTER TABLE "product_images"
        DROP COLUMN IF EXISTS "ai_source_image_id",
        DROP COLUMN IF EXISTS "focal_y",
        DROP COLUMN IF EXISTS "focal_x"
    `);
  }
}
