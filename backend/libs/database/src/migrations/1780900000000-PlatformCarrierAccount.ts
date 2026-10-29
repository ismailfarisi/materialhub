import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Platform-default shipping: carrier accounts with vendor_id NULL are
 * platform-owned (MaterialHub's own PostaPlus account). Vendors ship through
 * the platform account by default; a vendor-owned account is an opt-in
 * override. Auto shipment creation flips to opt-out accordingly.
 */
export class PlatformCarrierAccount1780900000000 implements MigrationInterface {
  name = "PlatformCarrierAccount1780900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vendor_carrier_accounts" ALTER COLUMN "vendor_id" DROP NOT NULL;
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "vendor_carrier_accounts_platform_provider_uq"
        ON "vendor_carrier_accounts" ("provider_id")
        WHERE "vendor_id" IS NULL AND "deleted_at" IS NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE "vendors" ALTER COLUMN "auto_create_shipment" SET DEFAULT true;
    `);
    await queryRunner.query(`
      UPDATE "vendors" SET "auto_create_shipment" = true;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vendors" ALTER COLUMN "auto_create_shipment" SET DEFAULT false;
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "vendor_carrier_accounts_platform_provider_uq";
    `);
    await queryRunner.query(`
      DELETE FROM "vendor_carrier_accounts" WHERE "vendor_id" IS NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE "vendor_carrier_accounts" ALTER COLUMN "vendor_id" SET NOT NULL;
    `);
  }
}
