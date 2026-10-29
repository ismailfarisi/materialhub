import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateVendorIntegrationMappings1746000002000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE vendor_integration_mappings (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        integration_id  uuid NOT NULL REFERENCES vendor_integrations(id) ON DELETE CASCADE,
        event_type      integration_event_type NOT NULL,
        direction       integration_direction NOT NULL,
        spec            jsonb NOT NULL,
        is_enabled      boolean NOT NULL DEFAULT true,
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now(),
        deleted_at      timestamptz NULL
      );
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX vendor_integration_mappings_uq
        ON vendor_integration_mappings (integration_id, event_type, direction)
        WHERE deleted_at IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS vendor_integration_mappings CASCADE;");
  }
}
