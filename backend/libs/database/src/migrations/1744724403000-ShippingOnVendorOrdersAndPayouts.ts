import type { MigrationInterface, QueryRunner } from "typeorm";

export class ShippingOnVendorOrdersAndPayouts1744724403000 implements MigrationInterface {
  name = "ShippingOnVendorOrdersAndPayouts1744724403000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE vendor_orders
        ADD COLUMN carrier_cost integer NOT NULL DEFAULT 0;
    `);
    await queryRunner.query(`
      ALTER TABLE vendor_payouts
        ADD COLUMN shipping_collected integer NOT NULL DEFAULT 0,
        ADD COLUMN carrier_cost_total  integer NOT NULL DEFAULT 0;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE vendor_payouts
        DROP COLUMN carrier_cost_total,
        DROP COLUMN shipping_collected;
    `);
    await queryRunner.query(`
      ALTER TABLE vendor_orders DROP COLUMN carrier_cost;
    `);
  }
}
