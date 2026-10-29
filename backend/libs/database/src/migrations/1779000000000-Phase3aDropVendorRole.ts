import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Phase 3a — drop 'vendor' from users.role enum.
 *
 * 1. Capture affected user_ids into a temp table.
 * 2. Update role 'vendor' → 'customer' for those users.
 * 3. Bump token_version for affected users only (so their JWTs reissue with vm claim).
 * 4. Drop 'vendor' from the user_role Postgres enum via temp-column-swap.
 *
 * Targeted force re-login: customers / admins / super_admins are NOT impacted.
 * Only users whose role was being rewritten get their token_version incremented.
 */
export class Phase3aDropVendorRole1779000000000 implements MigrationInterface {
  name = "Phase3aDropVendorRole1779000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: capture affected user_ids
    await queryRunner.query(`
      CREATE TEMP TABLE _phase3a_affected_users AS
      SELECT id FROM users WHERE role = 'vendor';
    `);

    // Step 2: rewrite role 'vendor' → 'customer'
    await queryRunner.query(`
      UPDATE users SET role = 'customer' WHERE role = 'vendor';
    `);

    // Step 3: bump token_version for affected users only
    await queryRunner.query(`
      UPDATE users
         SET token_version = token_version + 1
       WHERE id IN (SELECT id FROM _phase3a_affected_users);
    `);

    // Step 3.5: rewrite any 'vendor' values in bulk_import_jobs.initiated_by_role
    // (also typed user_role) so the column can be cast across the enum swap.
    await queryRunner.query(`
      UPDATE bulk_import_jobs SET initiated_by_role = 'customer'
       WHERE initiated_by_role = 'vendor';
    `);

    // Step 4: drop 'vendor' from the user_role enum via temp-column-swap.
    // The DEFAULT clause has to be dropped before the type swap because Postgres
    // can't auto-cast a text default ('customer') to the new enum type during
    // ALTER COLUMN ... TYPE. Every column typed user_role must also be re-cast
    // before the old type can be dropped — otherwise it has dependents.
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);
    await queryRunner.query(`ALTER TYPE "user_role" RENAME TO "user_role_old"`);
    await queryRunner.query(
      `CREATE TYPE "user_role" AS ENUM ('super_admin', 'admin', 'customer', 'guest')`,
    );
    await queryRunner.query(`
      ALTER TABLE "users"
        ALTER COLUMN "role" TYPE "user_role"
        USING "role"::text::"user_role"
    `);
    await queryRunner.query(`
      ALTER TABLE "bulk_import_jobs"
        ALTER COLUMN "initiated_by_role" TYPE "user_role"
        USING "initiated_by_role"::text::"user_role"
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
        ALTER COLUMN "role" SET DEFAULT 'customer'
    `);
    await queryRunner.query(`DROP TYPE "user_role_old"`);

    // Note: the temp table _phase3a_affected_users is automatically dropped at session end.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add 'vendor' to the user_role enum. Drop the default first (same
    // reason as up(): Postgres can't auto-cast the 'customer' text default).
    // Both columns typed user_role must be re-cast before dropping the old type.
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);
    await queryRunner.query(`ALTER TYPE "user_role" RENAME TO "user_role_new"`);
    await queryRunner.query(
      `CREATE TYPE "user_role" AS ENUM ('super_admin', 'admin', 'vendor', 'customer', 'guest')`,
    );
    await queryRunner.query(`
      ALTER TABLE "users"
        ALTER COLUMN "role" TYPE "user_role"
        USING "role"::text::"user_role"
    `);
    await queryRunner.query(`
      ALTER TABLE "bulk_import_jobs"
        ALTER COLUMN "initiated_by_role" TYPE "user_role"
        USING "initiated_by_role"::text::"user_role"
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
        ALTER COLUMN "role" SET DEFAULT 'customer'
    `);
    await queryRunner.query(`DROP TYPE "user_role_new"`);

    // Note: token_version increments are NOT reverted (cosmetic — affected users
    // will have re-logged in by then). users.role rewrites to 'customer' are also
    // not reverted because we'd need to remember which users were originally 'vendor'.
    // The down() restores the CAPABILITY of role='vendor' but not historical state.
  }
}
