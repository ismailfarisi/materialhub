import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddOrderSurchargeTotal1780300000000 implements MigrationInterface {
  name = "AddOrderSurchargeTotal1780300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders"
        ADD COLUMN "surcharge_total" integer NOT NULL DEFAULT 0
        CONSTRAINT "orders_surcharge_total_nonneg" CHECK ("surcharge_total" >= 0);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders"
        DROP CONSTRAINT "orders_surcharge_total_nonneg",
        DROP COLUMN "surcharge_total";
    `);
  }
}
