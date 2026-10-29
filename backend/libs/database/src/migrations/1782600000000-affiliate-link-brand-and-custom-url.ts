import type { MigrationInterface, QueryRunner } from "typeorm";

export class AffiliateLinkBrandAndCustomUrl1782600000000 implements MigrationInterface {
  name = "AffiliateLinkBrandAndCustomUrl1782600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."affiliate_links_target_type_enum" ADD VALUE IF NOT EXISTS 'brand'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."affiliate_links_target_type_enum" ADD VALUE IF NOT EXISTS 'custom_url'`,
    );
    await queryRunner.query(
      `ALTER TABLE "affiliate_links" ADD COLUMN IF NOT EXISTS "target_url" character varying(500)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "affiliate_links" DROP COLUMN IF EXISTS "target_url"`);
  }
}
