import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddVendorOrderWarehouse1780300002000 implements MigrationInterface {
  name = "AddVendorOrderWarehouse1780300002000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Fulfillment-origin warehouse for the vendor sub-order. Nullable: stamped
    // at order-creation from the vendor's default warehouse when one exists.
    // Plain uuid column (no FK), consistent with inventory.warehouse_id and
    // shipments.warehouse_id, since warehouses are soft-deleted.
    await queryRunner.query(
      `ALTER TABLE "vendor_orders" ADD COLUMN IF NOT EXISTS "warehouse_id" uuid`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "vendor_orders" DROP COLUMN IF EXISTS "warehouse_id"`);
  }
}
