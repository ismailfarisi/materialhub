import type { MigrationInterface, QueryRunner } from "typeorm";

export class GiftFulfillment1780700000000 implements MigrationInterface {
  name = "GiftFulfillment1780700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "gift_orders_fulfillment_status_enum" AS ENUM (
        'awaiting_items','partially_received','ready_to_assemble','assembling',
        'packed','shipped','delivered','cancelled','exception'
      );
    `);

    await queryRunner.query(`ALTER TYPE "commission_status" ADD VALUE IF NOT EXISTS 'held';`);

    await queryRunner.query(`
      ALTER TABLE "gift_orders"
        ADD COLUMN "fulfillment_status" "gift_orders_fulfillment_status_enum" NOT NULL DEFAULT 'awaiting_items',
        ADD COLUMN "hub_warehouse_id" uuid,
        ADD COLUMN "assembled_at" timestamptz,
        ADD COLUMN "dispatched_at" timestamptz,
        ADD COLUMN "delivered_at" timestamptz,
        ADD COLUMN "outbound_carrier" varchar(100),
        ADD COLUMN "outbound_tracking_number" varchar(100),
        ADD COLUMN "outbound_tracking_url" varchar(1024),
        ADD COLUMN "assembly_notes" text;
    `);
    await queryRunner.query(`
      ALTER TABLE "gift_orders" ADD CONSTRAINT "fk_gift_orders_hub_warehouse"
        FOREIGN KEY ("hub_warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE "vendor_orders"
        ADD COLUMN "gift_order_id" uuid,
        ADD COLUMN "received_at_hub_at" timestamptz;
    `);
    await queryRunner.query(`
      ALTER TABLE "vendor_orders" ADD CONSTRAINT "fk_vendor_orders_gift_order"
        FOREIGN KEY ("gift_order_id") REFERENCES "gift_orders"("id") ON DELETE SET NULL;
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_vendor_orders_gift_order" ON "vendor_orders" ("gift_order_id");`,
    );

    await queryRunner.query(`
      CREATE TABLE "gift_order_status_history" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "gift_order_id" uuid NOT NULL,
        "from_status" varchar(50),
        "to_status" varchar(50) NOT NULL,
        "changed_by" uuid,
        "note" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_gift_order_status_history" PRIMARY KEY ("id"),
        CONSTRAINT "fk_gosh_gift_order" FOREIGN KEY ("gift_order_id") REFERENCES "gift_orders"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_gosh_gift_order" ON "gift_order_status_history" ("gift_order_id");`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "gift_order_status_history" CASCADE;`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_vendor_orders_gift_order";`);
    await queryRunner.query(
      `ALTER TABLE "vendor_orders" DROP CONSTRAINT IF EXISTS "fk_vendor_orders_gift_order";`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_orders" DROP COLUMN IF EXISTS "received_at_hub_at", DROP COLUMN IF EXISTS "gift_order_id";`,
    );
    await queryRunner.query(
      `ALTER TABLE "gift_orders" DROP CONSTRAINT IF EXISTS "fk_gift_orders_hub_warehouse";`,
    );
    await queryRunner.query(`
      ALTER TABLE "gift_orders"
        DROP COLUMN IF EXISTS "assembly_notes", DROP COLUMN IF EXISTS "outbound_tracking_url",
        DROP COLUMN IF EXISTS "outbound_tracking_number", DROP COLUMN IF EXISTS "outbound_carrier",
        DROP COLUMN IF EXISTS "delivered_at", DROP COLUMN IF EXISTS "dispatched_at",
        DROP COLUMN IF EXISTS "assembled_at", DROP COLUMN IF EXISTS "hub_warehouse_id",
        DROP COLUMN IF EXISTS "fulfillment_status";
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS "gift_orders_fulfillment_status_enum";`);
  }
}
