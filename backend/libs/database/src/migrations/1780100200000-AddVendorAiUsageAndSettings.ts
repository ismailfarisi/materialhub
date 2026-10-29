import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddVendorAiUsageAndSettings1780100200000 implements MigrationInterface {
  name = "AddVendorAiUsageAndSettings1780100200000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "vendor_ai_usage" (
        "vendor_id"  uuid NOT NULL REFERENCES "vendors"("id") ON DELETE CASCADE,
        "month"      char(7) NOT NULL,
        "count"      integer NOT NULL DEFAULT 0,
        PRIMARY KEY ("vendor_id", "month")
      )
    `);

    const defaultBlob = JSON.stringify({
      enabled: false,
      model: "gemini-2.5-flash-image",
      prompt:
        "Improve this product photo for an ecommerce marketplace listing. Brighten exposure, balance white levels, sharpen product edges, and remove minor background distractions. Keep the product, packaging text, color, and shape exactly faithful — no creative changes. Output a clean photo at the same composition.",
      per_vendor_monthly_cap: 200,
      per_vendor_per_minute_cap: 5,
    });

    // ON CONFLICT ("key") would require a full UNIQUE constraint, but site_settings
    // only has a *partial* unique index (`WHERE deleted_at IS NULL`). Use a
    // WHERE-NOT-EXISTS guard instead. Explicit `::varchar` casts on the key
    // parameter prevent Postgres' "inconsistent types deduced for parameter $1"
    // error when the same placeholder appears in both SELECT and WHERE positions.
    await queryRunner.query(
      `INSERT INTO "site_settings" ("key", "value", "value_type", "setting_group", "description")
       SELECT $1::varchar, $2::text, 'json', 'ai', 'AI image enhance configuration'
       WHERE NOT EXISTS (
         SELECT 1 FROM "site_settings"
         WHERE "key" = $1::varchar AND "deleted_at" IS NULL
       )`,
      ["ai_image_enhance", defaultBlob],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "site_settings" WHERE "key" = 'ai_image_enhance'`);
    await queryRunner.query(`DROP TABLE IF EXISTS "vendor_ai_usage"`);
  }
}
