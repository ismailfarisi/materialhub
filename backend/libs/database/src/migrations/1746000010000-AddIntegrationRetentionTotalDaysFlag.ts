import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddIntegrationRetentionTotalDaysFlag1746000010000 implements MigrationInterface {
  name = "AddIntegrationRetentionTotalDaysFlag1746000010000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO site_settings (id, key, value, value_type, setting_group, description, created_at, updated_at)
      VALUES (
        gen_random_uuid(),
        'data_retention_integration_total_days',
        '365',
        'integer',
        'integrations',
        'How many days of vendor_integration_deliveries to keep. The retention cron deletes older rows on the 1st of each month at 03:00 UTC. CASCADE removes related pending_writes.',
        now(),
        now()
      )
      ON CONFLICT (key) WHERE deleted_at IS NULL DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM site_settings WHERE key = 'data_retention_integration_total_days';
    `);
  }
}
