import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateVendorIntegrations1746000001000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE vendor_integrations (
        id                                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        vendor_id                           uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
        name                                varchar(255) NOT NULL,
        outbound_url                        text NULL,
        outbound_secret_encrypted           text NULL,
        outbound_previous_secret_encrypted  text NULL,
        outbound_secret_rotated_at          timestamptz NULL,
        inbound_secret_encrypted            text NULL,
        inbound_secret_last4                varchar(8) NULL,
        inbound_ip_allowlist                text[] NOT NULL DEFAULT '{}',
        inventory_authority                 integration_authority NOT NULL DEFAULT 'advisory',
        pricing_authority                   integration_authority NOT NULL DEFAULT 'advisory',
        is_active                           boolean NOT NULL DEFAULT true,
        degraded_until                      timestamptz NULL,
        last_outbound_success_at            timestamptz NULL,
        last_inbound_success_at             timestamptz NULL,
        created_at                          timestamptz NOT NULL DEFAULT now(),
        updated_at                          timestamptz NOT NULL DEFAULT now(),
        deleted_at                          timestamptz NULL
      );
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX vendor_integrations_active_uq
        ON vendor_integrations (vendor_id)
        WHERE is_active = true AND deleted_at IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS vendor_integrations CASCADE;");
  }
}
