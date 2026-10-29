import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Persist the final carrier-booking failure reason on the vendor sub-order
 * so the admin panel can surface it next to the Book Shipment retry button.
 * Written by the auto-shipment worker when a booking job exhausts its
 * retries; cleared on successful booking or manual retry.
 */
export class VendorOrderBookingError1781400000000 implements MigrationInterface {
  name = "VendorOrderBookingError1781400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vendor_orders" ADD COLUMN "booking_error" text;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vendor_orders" DROP COLUMN IF EXISTS "booking_error";
    `);
  }
}
