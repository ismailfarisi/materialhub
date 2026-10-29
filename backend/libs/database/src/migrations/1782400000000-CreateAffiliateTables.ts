import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAffiliateTables1782400000000 implements MigrationInterface {
  name = "CreateAffiliateTables1782400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "vendor_affiliates_status_enum" AS ENUM ('invited','active','suspended','revoked')`,
    );
    await queryRunner.query(
      `CREATE TYPE "affiliate_commission_type_enum" AS ENUM ('percentage','fixed')`,
    );
    await queryRunner.query(
      `CREATE TYPE "affiliate_links_target_type_enum" AS ENUM ('store','product')`,
    );
    await queryRunner.query(
      `CREATE TYPE "affiliate_commissions_status_enum" AS ENUM ('pending','earned','paid','reversed')`,
    );

    await queryRunner.query(`
      CREATE TABLE "vendor_affiliates" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "vendor_id" uuid NOT NULL,
        "user_id" uuid,
        "invite_email" varchar(255),
        "status" "vendor_affiliates_status_enum" NOT NULL DEFAULT 'invited',
        "commission_type" "affiliate_commission_type_enum" NOT NULL DEFAULT 'percentage',
        "commission_value" integer NOT NULL,
        "affiliate_code" varchar(50) NOT NULL,
        "invited_by" uuid,
        "joined_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "fk_vendor_affiliates_vendor" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id"),
        CONSTRAINT "fk_vendor_affiliates_user" FOREIGN KEY ("user_id") REFERENCES "users"("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_vendor_affiliates_code" ON "vendor_affiliates" ("affiliate_code") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_vendor_affiliates_vendor_user" ON "vendor_affiliates" ("vendor_id","user_id") WHERE "deleted_at" IS NULL AND "user_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_vendor_affiliates_vendor" ON "vendor_affiliates" ("vendor_id") WHERE "deleted_at" IS NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "affiliate_links" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "vendor_affiliate_id" uuid NOT NULL,
        "target_type" "affiliate_links_target_type_enum" NOT NULL,
        "target_id" uuid,
        "slug" varchar(50) NOT NULL,
        "click_count" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "fk_affiliate_links_affiliate" FOREIGN KEY ("vendor_affiliate_id") REFERENCES "vendor_affiliates"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_affiliate_links_slug" ON "affiliate_links" ("slug") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_affiliate_links_affiliate" ON "affiliate_links" ("vendor_affiliate_id") WHERE "deleted_at" IS NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "affiliate_attributions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "vendor_affiliate_id" uuid NOT NULL,
        "vendor_id" uuid NOT NULL,
        "user_id" uuid,
        "session_id" uuid,
        "product_id" uuid,
        "affiliate_link_id" uuid,
        "clicked_at" timestamptz NOT NULL DEFAULT now(),
        "expires_at" timestamptz NOT NULL,
        "attribution_window_days_snapshot" integer NOT NULL,
        "consumed_order_item_id" uuid,
        CONSTRAINT "fk_affiliate_attr_affiliate" FOREIGN KEY ("vendor_affiliate_id") REFERENCES "vendor_affiliates"("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_affiliate_attr_lookup_user" ON "affiliate_attributions" ("user_id","vendor_id","expires_at") WHERE "consumed_order_item_id" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_affiliate_attr_lookup_session" ON "affiliate_attributions" ("session_id","vendor_id","expires_at") WHERE "consumed_order_item_id" IS NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "affiliate_commissions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "vendor_affiliate_id" uuid NOT NULL,
        "vendor_id" uuid NOT NULL,
        "attribution_id" uuid NOT NULL,
        "order_id" uuid NOT NULL,
        "vendor_order_id" uuid NOT NULL,
        "order_item_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "gross_fils" bigint NOT NULL,
        "commission_type_snapshot" "affiliate_commission_type_enum" NOT NULL,
        "commission_value_snapshot" integer NOT NULL,
        "commission_fils" bigint NOT NULL,
        "status" "affiliate_commissions_status_enum" NOT NULL DEFAULT 'pending',
        "eligible_at" timestamptz,
        "earned_at" timestamptz,
        "wallet_transaction_id" uuid,
        "reversed_reason" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_affiliate_comm_affiliate" FOREIGN KEY ("vendor_affiliate_id") REFERENCES "vendor_affiliates"("id"),
        CONSTRAINT "fk_affiliate_comm_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_affiliate_commissions_order_item" ON "affiliate_commissions" ("order_item_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_affiliate_commissions_affiliate_status" ON "affiliate_commissions" ("vendor_affiliate_id","status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_affiliate_commissions_eligible" ON "affiliate_commissions" ("status","eligible_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "affiliate_commissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "affiliate_attributions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "affiliate_links"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "vendor_affiliates"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "affiliate_commissions_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "affiliate_links_target_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "affiliate_commission_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "vendor_affiliates_status_enum"`);
  }
}
