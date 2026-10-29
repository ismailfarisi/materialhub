import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddIntegrationRetentionPiiDaysFlag1746000012000 implements MigrationInterface {
  name = "AddIntegrationRetentionPiiDaysFlag1746000012000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO site_settings (id, key, value, value_type, setting_group, description, created_at, updated_at)
      VALUES (
        gen_random_uuid(),
        'data_retention_integration_pii_days',
        '90',
        'integer',
        'integrations',
        'Age in days after which the daily PII scrub cron removes email/phone/shipping_address fields from request_body in vendor_integration_deliveries. Row metadata is preserved for audit; only sensitive fields are stripped.',
        now(),
        now()
      )
      ON CONFLICT (key) WHERE deleted_at IS NULL DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM site_settings WHERE key = 'data_retention_integration_pii_days';
    `);
  }
}
