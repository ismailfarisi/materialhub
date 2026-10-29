import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateShipmentStatusHistory1744638000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE shipment_status_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        shipment_id UUID NOT NULL REFERENCES shipments(id),
        vendor_order_id UUID NOT NULL REFERENCES vendor_orders(id),
        from_status shipment_status NOT NULL,
        to_status shipment_status NOT NULL,
        changed_by UUID,
        changed_by_role VARCHAR(50) NOT NULL,
        is_customer_visible BOOLEAN NOT NULL DEFAULT false,
        reason TEXT,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX idx_shipment_status_history_shipment_created
        ON shipment_status_history (shipment_id, created_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS shipment_status_history;");
  }
}
