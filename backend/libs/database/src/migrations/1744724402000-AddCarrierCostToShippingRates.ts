import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddCarrierCostToShippingRates1744724402000 implements MigrationInterface {
  name = "AddCarrierCostToShippingRates1744724402000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE shipping_rates
        ADD COLUMN carrier          varchar(100) NULL,
        ADD COLUMN carrier_cost     integer      NULL
          CONSTRAINT shipping_rates_carrier_cost_nonneg CHECK (carrier_cost >= 0);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE shipping_rates
        DROP COLUMN carrier_cost,
        DROP COLUMN carrier;
    `);
  }
}
