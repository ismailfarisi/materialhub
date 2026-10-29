import type { MigrationInterface, QueryRunner } from "typeorm";

export class VendorMembershipFoundation1746500000000 implements MigrationInterface {
  name = "VendorMembershipFoundation1746500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Enums ────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "vendor_member_role_enum" AS ENUM ('owner', 'manager', 'staff', 'viewer')
    `);
    await queryRunner.query(`
      CREATE TYPE "vendor_member_status_enum" AS ENUM ('pending', 'active', 'revoked')
    `);

    // ── users.token_version ──────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "token_version" integer NOT NULL DEFAULT 1
    `);

    // ── vendor_members ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "vendor_members" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "vendor_id" uuid NOT NULL,
        "user_id" uuid NULL,
        "email" varchar(255) NOT NULL,
        "role" "vendor_member_role_enum" NOT NULL,
        "status" "vendor_member_status_enum" NOT NULL DEFAULT 'pending',
        "invite_token" varchar(64) NULL,
        "invite_expires_at" timestamptz NULL,
        "invited_by_user_id" uuid NULL,
        "accepted_at" timestamptz NULL,
        "revoked_at" timestamptz NULL,
        "revoked_by_user_id" uuid NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL,
        CONSTRAINT "PK_vendor_members" PRIMARY KEY ("id"),
        CONSTRAINT "FK_vendor_members_vendor"
          FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_vendor_members_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_vendor_members_invited_by"
          FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_vendor_members_revoked_by"
          FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    // Partial unique: one active membership per (vendor, user)
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_vendor_members_active"
      ON "vendor_members" ("vendor_id", "user_id")
      WHERE "status" = 'active' AND "deleted_at" IS NULL
    `);

    // Partial unique: only one active owner per vendor
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_vendor_members_active_owner"
      ON "vendor_members" ("vendor_id")
      WHERE "role" = 'owner' AND "status" = 'active' AND "deleted_at" IS NULL
    `);

    // Unique invite tokens (when present)
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_vendor_members_invite_token"
      ON "vendor_members" ("invite_token")
      WHERE "invite_token" IS NOT NULL
    `);

    // Partial unique: no duplicate pending invites per (vendor, lower(email))
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_vendor_members_pending_email"
      ON "vendor_members" ("vendor_id", lower("email"))
      WHERE "status" = 'pending' AND "deleted_at" IS NULL
    `);

    // Lookup: "list my active memberships" (used at login)
    await queryRunner.query(`
      CREATE INDEX "idx_vendor_members_user_status"
      ON "vendor_members" ("user_id", "status")
      WHERE "deleted_at" IS NULL
    `);

    // ── role_permissions ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "role_permissions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "role" "vendor_member_role_enum" NOT NULL,
        "permission" varchar(64) NOT NULL,
        "updated_by_user_id" uuid NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_role_permissions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_role_permissions_role_permission" UNIQUE ("role", "permission"),
        CONSTRAINT "FK_role_permissions_updated_by"
          FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    // ── Seed role_permissions matrix ─────────────────────────────────────
    const PERMS_FOR_ROLE: Record<string, string[]> = {
      owner: [
        "products.read",
        "products.write",
        "products.publish",
        "orders.read",
        "orders.fulfill",
        "orders.refund",
        "inventory.write",
        "vendor.profile.write",
        "payouts.read",
        "bank.read",
        "bank.write",
        "analytics.read",
        "team.read",
        "team.write",
      ],
      manager: [
        "products.read",
        "products.write",
        "products.publish",
        "orders.read",
        "orders.fulfill",
        "orders.refund",
        "inventory.write",
        "vendor.profile.write",
        "payouts.read",
        "bank.read",
        "analytics.read",
        "team.read",
      ],
      staff: ["products.read", "orders.read", "orders.fulfill", "inventory.write", "team.read"],
      viewer: ["products.read", "orders.read", "payouts.read", "analytics.read", "team.read"],
    };
    for (const [role, perms] of Object.entries(PERMS_FOR_ROLE)) {
      for (const perm of perms) {
        await queryRunner.query(
          `INSERT INTO "role_permissions" ("role", "permission") VALUES ($1, $2)`,
          [role, perm],
        );
      }
    }

    // ── Backfill vendor_members from existing vendors ────────────────────
    await queryRunner.query(`
      INSERT INTO "vendor_members" (
        "vendor_id", "user_id", "email", "role", "status",
        "accepted_at", "created_at", "updated_at"
      )
      SELECT
        v."id",
        v."user_id",
        u."email",
        'owner'::"vendor_member_role_enum",
        'active'::"vendor_member_status_enum",
        v."created_at",
        v."created_at",
        v."created_at"
      FROM "vendors" v
      INNER JOIN "users" u ON u."id" = v."user_id" AND u."deleted_at" IS NULL
      WHERE v."deleted_at" IS NULL
    `);

    // ── Verify backfill ─────────────────────────────────────────────────
    // Only check vendors whose owner user is still alive — vendors whose
    // owner was soft-deleted are intentionally skipped by the backfill and
    // will need a manual cleanup pass (Phase 2 task) before guards flip.
    const verifyRows: Array<{ count: string }> = await queryRunner.query(`
      SELECT COUNT(*)::text AS count
      FROM "vendors" v
      INNER JOIN "users" u ON u."id" = v."user_id" AND u."deleted_at" IS NULL
      WHERE v."deleted_at" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "vendor_members" m
          WHERE m."vendor_id" = v."id"
            AND m."role" = 'owner'
            AND m."status" = 'active'
            AND m."deleted_at" IS NULL
        )
    `);
    const missing = Number(verifyRows[0]?.count ?? 0);
    if (missing > 0) {
      throw new Error(
        `VendorMembershipFoundation backfill verification failed: ${missing} vendor(s) without active owner membership`,
      );
    }

    // ── Document deprecated shim on vendors.user_id ──────────────────────
    await queryRunner.query(`
      COMMENT ON COLUMN "vendors"."user_id" IS
        'DEPRECATED — denormalized owner shim, kept in sync with vendor_members.role=owner. Removed in Phase 3b.'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`COMMENT ON COLUMN "vendors"."user_id" IS NULL`);
    await queryRunner.query(`DROP TABLE IF EXISTS "role_permissions"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_vendor_members_user_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_vendor_members_pending_email"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_vendor_members_invite_token"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_vendor_members_active_owner"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_vendor_members_active"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "vendor_members"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "token_version"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "vendor_member_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "vendor_member_role_enum"`);
  }
}
