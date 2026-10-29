import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddIntegrationInboundFlag1746000007000 implements MigrationInterface {
  name = "AddIntegrationInboundFlag1746000007000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO site_settings (id, key, value, value_type, setting_group, description, created_at, updated_at)
      VALUES (
        gen_random_uuid(),
        'vendor_integrations_inbound_enabled',
        'false',
        'boolean',
        'integrations',
        'Master switch for inbound vendor integration webhooks (order.accept, order.reject, shipment.create, shipment.update_status, inventory.adjust, product.update_price, product.update_attribute). Default off; flip to "true" once a vendor integration is configured and you are ready to accept inbound writes.',
        now(),
        now()
      )
      ON CONFLICT (key) WHERE deleted_at IS NULL DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "DELETE FROM site_settings WHERE key = 'vendor_integrations_inbound_enabled';",
    );
  }
}
