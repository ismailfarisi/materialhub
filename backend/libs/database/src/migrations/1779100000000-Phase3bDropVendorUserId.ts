import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Phase 3b — drop the legacy `vendors.user_id` column.
 *
 * Vendor ownership is now expressed entirely through `vendor_members.owner`
 * rows (active or pending). The denormalized `vendors.user_id` shim that
 * Phase 1/2/3a kept alive is no longer read or written by production code.
 *
 * 1. Backfill: for any pending vendor that lacks an owner membership row,
 *    create a `pending` one. Phase 1 backfill only covered approved vendors;
 *    apply()-time inserts only started in this same Phase 3b code change, so
 *    in-flight pending applications need a row created here.
 * 2. Drop the FK constraint `fk_vendors_user`.
 * 3. Drop the partial unique index `uq_vendors_user_id_active`.
 * 4. Drop the `user_id` column.
 */
export class Phase3bDropVendorUserId1779100000000 implements MigrationInterface {
  name = "Phase3bDropVendorUserId1779100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: backfill pending vendor_members.owner rows for any vendor that
    // lacks one. Idempotent — ON CONFLICT relies on the table's partial unique
    // on (vendor_id, user_id) WHERE status='active', which doesn't apply to
    // pending rows. Use NOT EXISTS guard instead.
    await queryRunner.query(`
      INSERT INTO "vendor_members"
        (id, vendor_id, user_id, email, role, status, created_at, updated_at)
      SELECT gen_random_uuid(), v.id, v.user_id, lower(u.email),
             'owner', 'pending', v.created_at, NOW()
        FROM "vendors" v
        JOIN "users" u ON u.id = v.user_id
       WHERE v.deleted_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM "vendor_members" vm
            WHERE vm.vendor_id = v.id
              AND vm.role = 'owner'
              AND vm.deleted_at IS NULL
         );
    `);

    // Step 2: drop the FK constraint before the column.
    await queryRunner.query(`ALTER TABLE "vendors" DROP CONSTRAINT IF EXISTS "fk_vendors_user"`);

    // Step 3: drop the partial unique index.
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_vendors_user_id_active"`);

    // Step 4: drop the column.
    await queryRunner.query(`ALTER TABLE "vendors" DROP COLUMN IF EXISTS "user_id"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-create the column nullable, backfill from vendor_members, then enforce NOT NULL.
    await queryRunner.query(`ALTER TABLE "vendors" ADD COLUMN "user_id" uuid`);

    // Backfill from the canonical owner row (prefer active, fall back to pending).
    await queryRunner.query(`
      UPDATE "vendors" v
         SET "user_id" = vm.user_id
        FROM (
          SELECT DISTINCT ON (vendor_id) vendor_id, user_id
            FROM "vendor_members"
           WHERE role = 'owner' AND deleted_at IS NULL
             AND status IN ('active', 'pending')
           ORDER BY vendor_id, (status = 'active') DESC, created_at DESC
        ) vm
       WHERE vm.vendor_id = v.id
         AND v.deleted_at IS NULL;
    `);

    // Restore the FK + partial unique index. NOT NULL only after backfill.
    await queryRunner.query(`ALTER TABLE "vendors" ALTER COLUMN "user_id" SET NOT NULL`);
    await queryRunner.query(`
      ALTER TABLE "vendors"
        ADD CONSTRAINT "fk_vendors_user"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_vendors_user_id_active"
        ON "vendors" ("user_id") WHERE "deleted_at" IS NULL
    `);
  }
}
