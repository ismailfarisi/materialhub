import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateVendorIntegrationPendingWrites1746000004000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE vendor_integration_pending_writes (
        id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        integration_id                  uuid NOT NULL REFERENCES vendor_integrations(id) ON DELETE CASCADE,
        delivery_id                     uuid NOT NULL REFERENCES vendor_integration_deliveries(id) ON DELETE CASCADE,
        kind                            varchar(32) NOT NULL,
        payload                         jsonb NOT NULL,
        status                          varchar(16) NOT NULL DEFAULT 'pending',
        auto_apply_threshold_breached   boolean NOT NULL DEFAULT false,
        reviewed_by                     uuid NULL,
        reviewed_at                     timestamptz NULL,
        applied_at                      timestamptz NULL,
        created_at                      timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE INDEX vipw_status_idx
        ON vendor_integration_pending_writes (integration_id, status);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS vendor_integration_pending_writes CASCADE;");
  }
}
