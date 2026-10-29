import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddCodToPaymentMethodThresholds1744724406000 implements MigrationInterface {
  name = "AddCodToPaymentMethodThresholds1744724406000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE payment_method_thresholds
        DROP CONSTRAINT payment_method_thresholds_provider_check;
    `);

    await queryRunner.query(`
      ALTER TABLE payment_method_thresholds
        ADD CONSTRAINT payment_method_thresholds_provider_check
        CHECK (provider IN ('tabby', 'tamara', 'cod'));
    `);

    await queryRunner.query(`
      ALTER TABLE payment_method_thresholds
        ADD COLUMN surcharge_fils bigint NULL
        CONSTRAINT payment_method_thresholds_surcharge_nonneg
        CHECK (surcharge_fils IS NULL OR surcharge_fils >= 0);
    `);

    await queryRunner.query(`
      INSERT INTO payment_method_thresholds
        (provider, min_amount_fils, max_amount_fils, plans, is_active, surcharge_fils)
      VALUES
        ('cod', 0, 500000, '[]'::jsonb, true, 1000)
      ON CONFLICT (provider) DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM payment_method_thresholds WHERE provider = 'cod';`);

    await queryRunner.query(`
      ALTER TABLE payment_method_thresholds
        DROP CONSTRAINT payment_method_thresholds_surcharge_nonneg,
        DROP COLUMN surcharge_fils;
    `);

    await queryRunner.query(`
      ALTER TABLE payment_method_thresholds
        DROP CONSTRAINT payment_method_thresholds_provider_check;
    `);

    await queryRunner.query(`
      ALTER TABLE payment_method_thresholds
        ADD CONSTRAINT payment_method_thresholds_provider_check
        CHECK (provider IN ('tabby', 'tamara'));
    `);
  }
}
