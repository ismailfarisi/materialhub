import type { MigrationInterface, QueryRunner } from "typeorm";

export class CheckoutQuoteApiP11744724400000 implements MigrationInterface {
  name = "CheckoutQuoteApiP11744724400000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "rule_action" AS ENUM ('deny');`);
    await queryRunner.query(`CREATE TYPE "surcharge_type" AS ENUM ('fixed', 'percentage_bps');`);

    await queryRunner.query(`
      CREATE TABLE payment_method_thresholds (
        provider        varchar(32) PRIMARY KEY
                        CHECK (provider IN ('tabby', 'tamara')),
        min_amount_fils bigint NOT NULL,
        max_amount_fils bigint NOT NULL,
        plans           jsonb NOT NULL,
        updated_at      timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      INSERT INTO payment_method_thresholds (provider, min_amount_fils, max_amount_fils, plans) VALUES
      ('tabby',  10000, 500000, '[{"installments": 4, "interval_days": 30}, {"installments": 3, "interval_days": 30}]'::jsonb),
      ('tamara',  5000, 300000, '[{"installments": 3, "interval_days": 30}]'::jsonb);
    `);

    await queryRunner.query(`
      CREATE TABLE rules_epoch (
        id          smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        epoch       bigint NOT NULL DEFAULT 0,
        updated_at  timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query("INSERT INTO rules_epoch (id, epoch) VALUES (1, 0);");

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION bump_rules_epoch() RETURNS trigger
        LANGUAGE plpgsql AS $$
      BEGIN
        UPDATE rules_epoch SET epoch = epoch + 1, updated_at = now() WHERE id = 1;
        RETURN COALESCE(NEW, OLD);
      END;
      $$;
    `);

    await queryRunner.query(`
      CREATE TRIGGER trg_bump_rules_epoch_thresholds
      AFTER INSERT OR UPDATE OR DELETE ON payment_method_thresholds
      FOR EACH ROW EXECUTE FUNCTION bump_rules_epoch();
    `);

    await queryRunner.query(`
      CREATE TRIGGER trg_bump_rules_epoch_shipping_rates
      AFTER INSERT OR UPDATE OR DELETE ON shipping_rates
      FOR EACH ROW EXECUTE FUNCTION bump_rules_epoch();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "DROP TRIGGER IF EXISTS trg_bump_rules_epoch_shipping_rates ON shipping_rates;",
    );
    await queryRunner.query(
      "DROP TRIGGER IF EXISTS trg_bump_rules_epoch_thresholds ON payment_method_thresholds;",
    );
    await queryRunner.query("DROP FUNCTION IF EXISTS bump_rules_epoch();");
    await queryRunner.query("DROP TABLE IF EXISTS rules_epoch;");
    await queryRunner.query("DROP TABLE IF EXISTS payment_method_thresholds;");
    await queryRunner.query(`DROP TYPE IF EXISTS "surcharge_type";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "rule_action";`);
  }
}
