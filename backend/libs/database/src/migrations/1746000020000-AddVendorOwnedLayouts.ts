import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddVendorOwnedLayouts1746000020000 implements MigrationInterface {
  name = "AddVendorOwnedLayouts1746000020000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Ensure testimonials and beauty_tips section types exist (not seeded by prior migrations)
    await queryRunner.query(`
      INSERT INTO "section_types" ("name", "label", "icon", "supports_bidding", "default_settings")
      VALUES
        ('testimonials', '{"en":"Testimonials","ar":"شهادات العملاء"}', 'quote', false, '{}'),
        ('beauty_tips', '{"en":"Beauty Tips","ar":"نصائح الجمال"}', 'sparkles', false, '{}')
      ON CONFLICT ("name") DO NOTHING
    `);

    // 1. Add vendor_id to page_layouts
    await queryRunner.query(
      `ALTER TABLE "page_layouts" ADD COLUMN "vendor_id" uuid NULL REFERENCES "vendors"("id") ON DELETE CASCADE`,
    );

    // 2. Drop the old global UNIQUE(slug) and replace with two partial uniques
    //    (the constraint name is hardcoded in 1712200000000-HomepageLayoutSystem.ts)
    await queryRunner.query(
      `ALTER TABLE "page_layouts" DROP CONSTRAINT IF EXISTS "uq_page_layouts_slug"`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_page_layouts_admin_slug" ON "page_layouts"("slug") WHERE "vendor_id" IS NULL AND "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_page_layouts_vendor_slug" ON "page_layouts"("vendor_id","slug") WHERE "vendor_id" IS NOT NULL AND "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_page_layouts_vendor" ON "page_layouts"("vendor_id") WHERE "deleted_at" IS NULL`,
    );

    // 3. Add scope to section_types
    await queryRunner.query(
      `ALTER TABLE "section_types" ADD COLUMN "scope" VARCHAR(20) NOT NULL DEFAULT 'platform'`,
    );

    // Mark vendor-friendly section types as 'both'
    await queryRunner.query(
      `UPDATE "section_types" SET "scope" = 'both' WHERE "name" IN (
         'hero_carousel','product_carousel','promotional_banner','flash_deals',
         'trending_reels','testimonials','beauty_tips','category_grid'
       )`,
    );

    // 4. Seed admin template layout (vendor-default)
    // Use FROM "users" so that if no super_admin exists the SELECT yields 0 rows
    // and the INSERT does nothing (no NOT NULL violation on created_by).
    const layoutRows = await queryRunner.query(
      `INSERT INTO "page_layouts" ("slug","title","status","created_by")
       SELECT 'vendor-default',
              '{"en":"Vendor Storefront Template","ar":"قالب متجر البائع"}'::jsonb,
              'published',
              u."id"
         FROM "users" u
        WHERE u."role" = 'super_admin'
          AND NOT EXISTS (SELECT 1 FROM "page_layouts" WHERE "slug" = 'vendor-default' AND "vendor_id" IS NULL)
        ORDER BY u."created_at" ASC
        LIMIT 1
       RETURNING "id", "created_by"`,
    );

    if (layoutRows.length > 0) {
      const layoutId = layoutRows[0].id;
      const createdBy = layoutRows[0].created_by;

      // Initial published version
      const versionRows = await queryRunner.query(
        `INSERT INTO "layout_versions" ("layout_id","version_number","published_at","created_by")
         VALUES ($1, 1, NOW(), $2) RETURNING "id"`,
        [layoutId, createdBy],
      );
      const versionId = versionRows[0].id;

      await queryRunner.query(
        `UPDATE "page_layouts" SET "published_version_id" = $1 WHERE "id" = $2`,
        [versionId, layoutId],
      );

      // Seed default sections (hero + promo + product carousel + testimonials)
      // hero_carousel: manual blocks (admin can swap with vendor's banner_url at render time)
      const types = await queryRunner.query(
        `SELECT "id","name" FROM "section_types"
          WHERE "name" IN ('hero_carousel','promotional_banner','product_carousel','testimonials')`,
      );
      const typeMap = Object.fromEntries(
        types.map((r: { id: string; name: string }) => [r.name, r.id]),
      );

      await queryRunner.query(
        `INSERT INTO "layout_sections" ("version_id","section_type_id","position","source_mode","settings","blocks") VALUES
           ($1,$2,0,'manual','{"use_vendor_banner":true}'::jsonb,'[]'::jsonb),
           ($1,$3,1,'manual','{}'::jsonb,'[]'::jsonb),
           ($1,$4,2,'query','{"title":{"en":"Featured Products"}}'::jsonb,NULL),
           ($1,$5,3,'manual','{"title":{"en":"What Customers Say"}}'::jsonb,'[]'::jsonb)`,
        [
          versionId,
          typeMap.hero_carousel,
          typeMap.promotional_banner,
          typeMap.product_carousel,
          typeMap.testimonials,
        ],
      );

      // The product_carousel needs a data_source to scope at resolve time
      await queryRunner.query(
        `UPDATE "layout_sections" SET "data_source" = '{"type":"products","query":{"limit":12,"sort":"newest"}}'::jsonb
          WHERE "version_id" = $1 AND "section_type_id" = $2`,
        [versionId, typeMap.product_carousel],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const vendorLayouts = await queryRunner.query(
      `SELECT COUNT(*)::int AS c FROM "page_layouts" WHERE "vendor_id" IS NOT NULL`,
    );
    if (vendorLayouts[0].c > 0) {
      throw new Error(
        `Cannot roll back AddVendorOwnedLayouts1746000020000: ${vendorLayouts[0].c} vendor-owned layouts exist. Delete them first (DELETE FROM page_layouts WHERE vendor_id IS NOT NULL) if rollback is intentional.`,
      );
    }

    // Remove seeded template (cascades to its versions/sections via existing FKs)
    await queryRunner.query(
      `DELETE FROM "page_layouts" WHERE "slug" = 'vendor-default' AND "vendor_id" IS NULL`,
    );

    await queryRunner.query(`ALTER TABLE "section_types" DROP COLUMN IF EXISTS "scope"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "idx_page_layouts_vendor"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_page_layouts_vendor_slug"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_page_layouts_admin_slug"`);
    await queryRunner.query(
      `ALTER TABLE "page_layouts" ADD CONSTRAINT "UQ_page_layouts_slug" UNIQUE ("slug")`,
    );
    await queryRunner.query(`ALTER TABLE "page_layouts" DROP COLUMN IF EXISTS "vendor_id"`);
  }
}
