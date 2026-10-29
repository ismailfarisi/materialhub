import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddIntegrationEventsFlag1746000005000 implements MigrationInterface {
  name = "AddIntegrationEventsFlag1746000005000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO site_settings (id, key, value, value_type, setting_group, description, created_at, updated_at)
      VALUES (
        gen_random_uuid(),
        'vendor_integrations_outbound_enabled',
        'false',
        'boolean',
        'integrations',
        'Master switch for outbound vendor integration events (vendor_order.created, vendor_order.status_changed, shipment.created, shipment.status_changed). Default off; flip to "true" once a vendor integration is configured and you are ready to dispatch.',
        now(),
        now()
      )
      ON CONFLICT (key) WHERE deleted_at IS NULL DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM site_settings WHERE key = 'vendor_integrations_outbound_enabled';
    `);
  }
}
