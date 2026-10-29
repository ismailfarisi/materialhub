import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddShipmentEventExternalId1744724408000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE shipment_events
        ADD COLUMN external_event_id varchar(255) NULL,
        ADD COLUMN provider_id uuid NULL REFERENCES shipping_providers(id) ON DELETE SET NULL;
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX shipment_events_external_id_uq
        ON shipment_events (provider_id, external_event_id)
        WHERE external_event_id IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP INDEX IF EXISTS shipment_events_external_id_uq;");
    await queryRunner.query(`
      ALTER TABLE shipment_events
        DROP COLUMN IF EXISTS provider_id,
        DROP COLUMN IF EXISTS external_event_id;
    `);
  }
}
