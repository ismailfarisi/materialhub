import type { MigrationInterface, QueryRunner } from "typeorm";

export class DropShippingCollectedFromPayouts1744724405000 implements MigrationInterface {
  name = "DropShippingCollectedFromPayouts1744724405000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE vendor_payouts DROP COLUMN shipping_collected;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE vendor_payouts
        ADD COLUMN shipping_collected integer NOT NULL DEFAULT 0;
    `);
  }
}
