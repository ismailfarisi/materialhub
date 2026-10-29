import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddShipmentExternalId1744724409000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE shipments ADD COLUMN external_shipment_id varchar(255) NULL;
      CREATE INDEX shipments_external_shipment_id_idx
        ON shipments (external_shipment_id) WHERE external_shipment_id IS NOT NULL;
    `);
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS shipments_external_shipment_id_idx;
      ALTER TABLE shipments DROP COLUMN IF EXISTS external_shipment_id;
    `);
  }
}
