import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddCartAffiliateCode1782500000000 implements MigrationInterface {
  name = "AddCartAffiliateCode1782500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "carts" ADD COLUMN "affiliate_code" varchar(50)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "carts" DROP COLUMN IF EXISTS "affiliate_code"`);
  }
}
