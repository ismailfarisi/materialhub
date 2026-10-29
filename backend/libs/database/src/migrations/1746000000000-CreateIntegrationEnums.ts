import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateIntegrationEnums1746000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE integration_event_type AS ENUM (
        'vendor_order.created','vendor_order.status_changed',
        'shipment.created','shipment.status_changed',
        'order.accept','order.reject',
        'shipment.create','shipment.update_status',
        'inventory.adjust','product.update_price','product.update_attribute'
      );
    `);
    await queryRunner.query(`
      CREATE TYPE integration_direction AS ENUM ('outbound','inbound');
    `);
    await queryRunner.query(`
      CREATE TYPE integration_delivery_status AS ENUM ('pending','delivered','failed','dlq','skipped');
    `);
    await queryRunner.query(`
      CREATE TYPE integration_authority AS ENUM ('authoritative','advisory');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TYPE IF EXISTS integration_authority;");
    await queryRunner.query("DROP TYPE IF EXISTS integration_delivery_status;");
    await queryRunner.query("DROP TYPE IF EXISTS integration_direction;");
    await queryRunner.query("DROP TYPE IF EXISTS integration_event_type;");
  }
}
