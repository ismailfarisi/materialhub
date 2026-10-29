import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateVendorIntegrationDeliveries1746000003000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE vendor_integration_deliveries (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        integration_id  uuid NOT NULL REFERENCES vendor_integrations(id) ON DELETE CASCADE,
        event_type      integration_event_type NOT NULL,
        direction       integration_direction NOT NULL,
        source_ref      jsonb NULL,
        idempotency_key varchar(128) NULL,
        request_body    jsonb NULL,
        request_headers jsonb NULL,
        response_status integer NULL,
        response_body   text NULL,
        latency_ms      integer NOT NULL DEFAULT 0,
        attempt         smallint NOT NULL DEFAULT 1,
        status          integration_delivery_status NOT NULL DEFAULT 'pending',
        error_message   text NULL,
        created_at      timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE INDEX vid_integration_created_idx
        ON vendor_integration_deliveries (integration_id, created_at DESC);
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX vid_idempotency_uq
        ON vendor_integration_deliveries (idempotency_key, integration_id)
        WHERE idempotency_key IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS vendor_integration_deliveries CASCADE;");
  }
}
