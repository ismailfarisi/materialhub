import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * page_layouts.slug was globally unique (regenerated InitialSchema), but every
 * vendor storefront uses the slug "vendor-storefront", so only the first
 * vendor could initialise a storefront; the next hit 23505 and the init
 * request failed. Restore the pre-squash design (AddVendorOwnedLayouts):
 * unique per owner, ignoring soft-deleted rows.
 */
export class PageLayoutSlugPerOwner1794100000001 implements MigrationInterface {
  name = "PageLayoutSlugPerOwner1794100000001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "page_layouts" DROP CONSTRAINT IF EXISTS "UQ_1d5d5d7605ac6cfa66836304d37"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_page_layouts_admin_slug" ON "page_layouts" ("slug") WHERE "vendor_id" IS NULL AND "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_page_layouts_vendor_slug" ON "page_layouts" ("vendor_id", "slug") WHERE "vendor_id" IS NOT NULL AND "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restoring the global constraint fails once two vendors have storefronts;
    // that failure is intended (it would break them again).
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_page_layouts_vendor_slug"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_page_layouts_admin_slug"`);
    await queryRunner.query(
      `ALTER TABLE "page_layouts" ADD CONSTRAINT "UQ_1d5d5d7605ac6cfa66836304d37" UNIQUE ("slug")`,
    );
  }
}
