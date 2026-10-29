import type { MigrationInterface, QueryRunner } from "typeorm";

export class IndexTaggableProductsLookup1744466400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_shipment_items_order_item"
      ON "shipment_items" ("order_item_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_shipment_items_delivered_desc"
      ON "shipment_items" ("delivered_at" DESC)
      WHERE "is_delivered" = TRUE
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_return_items_order_item"
      ON "return_items" ("order_item_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_return_items_order_item"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_shipment_items_delivered_desc"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_shipment_items_order_item"`);
  }
}
