import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddIsActiveToPaymentMethodThresholds1744724401000 implements MigrationInterface {
  name = "AddIsActiveToPaymentMethodThresholds1744724401000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE payment_method_thresholds
        ADD COLUMN is_active boolean NOT NULL DEFAULT true;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE payment_method_thresholds DROP COLUMN is_active;
    `);
  }
}
