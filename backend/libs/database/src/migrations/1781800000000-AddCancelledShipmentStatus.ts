import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddCancelledShipmentStatus1781800000000 implements MigrationInterface {
  name = "AddCancelledShipmentStatus1781800000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE "shipment_status" ADD VALUE IF NOT EXISTS 'cancelled';`);
  }

  public async down(_q: QueryRunner): Promise<void> {
    // PostgreSQL cannot remove enum values without recreating the type and
    // rewriting dependent columns. Keep this migration irreversible.
  }
}
