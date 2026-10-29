import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Lets a vendor submit a brand the catalogue is missing, for an admin to approve.
 *
 * The brand row is created at submission time rather than on approval, so the
 * vendor can attach it to products straight away — the `status` column is what
 * keeps an unreviewed brand off the storefront. `submitted_by_vendor_id` is
 * provenance for the review queue; it grants no ownership, since an approved
 * brand is shared catalogue data.
 *
 * Every existing brand was created by an admin, so the backfill marks them all
 * approved. The column default does the same for future admin inserts, which
 * means `BrandService.create` needs no change to keep working.
 */
export class BrandSubmissionModeration1786200000000 implements MigrationInterface {
  name = "BrandSubmissionModeration1786200000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TYPE "brand_status_enum" AS ENUM ('pending', 'approved', 'rejected');
    `);

    await q.query(`
      ALTER TABLE "brands"
        ADD COLUMN "status" "brand_status_enum" NOT NULL DEFAULT 'approved',
        ADD COLUMN "submitted_by_vendor_id" uuid,
        ADD COLUMN "submitted_at" timestamptz,
        ADD COLUMN "reviewed_by_user_id" uuid,
        ADD COLUMN "reviewed_at" timestamptz,
        ADD COLUMN "rejection_reason" text;
    `);

    await q.query(`
      ALTER TABLE "brands"
        ADD CONSTRAINT "fk_brand_submitted_by_vendor" FOREIGN KEY ("submitted_by_vendor_id")
          REFERENCES "vendors"("id") ON DELETE SET NULL,
        ADD CONSTRAINT "fk_brand_reviewed_by_user" FOREIGN KEY ("reviewed_by_user_id")
          REFERENCES "users"("id") ON DELETE SET NULL;
    `);

    // A rejection has to say why — the reason is shown back to the vendor.
    await q.query(`
      ALTER TABLE "brands"
        ADD CONSTRAINT "ck_brand_rejection_reason"
        CHECK ("status" <> 'rejected' OR "rejection_reason" IS NOT NULL);
    `);

    // Every public read filters on status; the review queue reads pending only.
    await q.query(`
      CREATE INDEX "idx_brands_status" ON "brands" ("status") WHERE "deleted_at" IS NULL;
    `);
    await q.query(`
      CREATE INDEX "idx_brands_submitted_by_vendor" ON "brands" ("submitted_by_vendor_id")
        WHERE "deleted_at" IS NULL AND "submitted_by_vendor_id" IS NOT NULL;
    `);

    // Existing rows predate vendor submission and were all admin-created. The
    // column default already wrote 'approved'; this is belt and braces for a
    // table restored from a dump where the default did not apply.
    await q.query(`UPDATE "brands" SET "status" = 'approved' WHERE "status" IS NULL;`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "idx_brands_submitted_by_vendor";`);
    await q.query(`DROP INDEX IF EXISTS "idx_brands_status";`);
    await q.query(`ALTER TABLE "brands" DROP CONSTRAINT IF EXISTS "ck_brand_rejection_reason";`);
    await q.query(`ALTER TABLE "brands" DROP CONSTRAINT IF EXISTS "fk_brand_reviewed_by_user";`);
    await q.query(`ALTER TABLE "brands" DROP CONSTRAINT IF EXISTS "fk_brand_submitted_by_vendor";`);
    await q.query(`
      ALTER TABLE "brands"
        DROP COLUMN IF EXISTS "rejection_reason",
        DROP COLUMN IF EXISTS "reviewed_at",
        DROP COLUMN IF EXISTS "reviewed_by_user_id",
        DROP COLUMN IF EXISTS "submitted_at",
        DROP COLUMN IF EXISTS "submitted_by_vendor_id",
        DROP COLUMN IF EXISTS "status";
    `);
    await q.query(`DROP TYPE IF EXISTS "brand_status_enum";`);
  }
}
