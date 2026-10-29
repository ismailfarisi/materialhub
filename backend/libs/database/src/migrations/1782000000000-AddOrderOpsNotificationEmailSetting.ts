import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddOrderOpsNotificationEmailSetting1782000000000 implements MigrationInterface {
  name = "AddOrderOpsNotificationEmailSetting1782000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO site_settings (id, key, value, value_type, setting_group, description, created_at, updated_at)
      VALUES (
        gen_random_uuid(),
        'order_ops_notification_email',
        '',
        'string',
        'general',
        'Internal inbox that receives a full-detail email on every new order. Leave blank to disable. Set from the admin Settings page.',
        now(),
        now()
      )
      ON CONFLICT (key) WHERE deleted_at IS NULL DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM site_settings WHERE key = 'order_ops_notification_email';
    `);
  }
}
