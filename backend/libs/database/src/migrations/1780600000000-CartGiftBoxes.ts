import type { MigrationInterface, QueryRunner } from "typeorm";

export class CartGiftBoxes1780600000000 implements MigrationInterface {
  name = "CartGiftBoxes1780600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "cart_gift_boxes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "cart_id" uuid NOT NULL,
        "gift_box_id" uuid NOT NULL,
        "quantity" integer NOT NULL DEFAULT 1,
        "unit_price" integer NOT NULL,
        "packaging_price" integer NOT NULL DEFAULT 0,
        "discount_total" integer NOT NULL DEFAULT 0,
        "box_name_snapshot" varchar(200) NOT NULL,
        "style_snapshot" jsonb,
        "occasion_snapshot" jsonb,
        "components" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "gift_message" text,
        "recipient_name" varchar(200),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_cart_gift_boxes" PRIMARY KEY ("id"),
        CONSTRAINT "fk_cart_gift_boxes_cart"
          FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_cart_gift_boxes_cart" ON "cart_gift_boxes" ("cart_id");`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "cart_gift_boxes" CASCADE;`);
  }
}
