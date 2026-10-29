import type { MigrationInterface, QueryRunner } from "typeorm";

export class Gifting1780500000000 implements MigrationInterface {
  name = "Gifting1780500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "gift_occasions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" varchar(120) NOT NULL,
        "slug" varchar(120) NOT NULL,
        "image_url" text,
        "sort_order" smallint NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_gift_occasions" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_gift_occasions_slug_active"
        ON "gift_occasions" ("slug") WHERE "deleted_at" IS NULL;
    `);

    await queryRunner.query(`
      CREATE TABLE "gift_box_styles" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" varchar(150) NOT NULL,
        "slug" varchar(150) NOT NULL,
        "description" text,
        "dimensions" jsonb,
        "max_capacity" integer NOT NULL DEFAULT 1,
        "base_price" integer NOT NULL DEFAULT 0,
        "images" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_gift_box_styles" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_gift_box_styles_slug_active"
        ON "gift_box_styles" ("slug") WHERE "deleted_at" IS NULL;
    `);

    await queryRunner.query(`
      CREATE TABLE "gift_boxes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" varchar(200) NOT NULL,
        "slug" varchar(200) NOT NULL,
        "description" text,
        "style_id" uuid NOT NULL,
        "hero_image_url" text,
        "discount_percentage" numeric(5,2),
        "is_active" boolean NOT NULL DEFAULT true,
        "starts_at" timestamptz,
        "expires_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_gift_boxes" PRIMARY KEY ("id"),
        CONSTRAINT "fk_gift_boxes_style"
          FOREIGN KEY ("style_id") REFERENCES "gift_box_styles"("id") ON DELETE RESTRICT
      );
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_gift_boxes_slug_active"
        ON "gift_boxes" ("slug") WHERE "deleted_at" IS NULL;
    `);

    await queryRunner.query(`
      CREATE TABLE "gift_box_occasions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "gift_box_id" uuid NOT NULL,
        "occasion_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_gift_box_occasions" PRIMARY KEY ("id"),
        CONSTRAINT "fk_gbo_box" FOREIGN KEY ("gift_box_id") REFERENCES "gift_boxes"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_gbo_occasion" FOREIGN KEY ("occasion_id") REFERENCES "gift_occasions"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_gift_box_occasions_pair"
        ON "gift_box_occasions" ("gift_box_id", "occasion_id");
    `);

    await queryRunner.query(`
      CREATE TABLE "gift_box_items" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "gift_box_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "variant_id" uuid,
        "quantity" integer NOT NULL DEFAULT 1,
        "sort_order" smallint NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_gift_box_items" PRIMARY KEY ("id"),
        CONSTRAINT "fk_gbi_box" FOREIGN KEY ("gift_box_id") REFERENCES "gift_boxes"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_gbi_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT
      );
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_gift_box_items_variant"
        ON "gift_box_items" ("gift_box_id", "product_id", "variant_id")
        WHERE "deleted_at" IS NULL AND "variant_id" IS NOT NULL;
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_gift_box_items_novariant"
        ON "gift_box_items" ("gift_box_id", "product_id")
        WHERE "deleted_at" IS NULL AND "variant_id" IS NULL;
    `);

    await queryRunner.query(`
      CREATE TABLE "gift_orders" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "order_id" uuid NOT NULL,
        "gift_box_id" uuid,
        "box_name_snapshot" varchar(200) NOT NULL,
        "box_style_snapshot" jsonb,
        "occasion_snapshot" jsonb,
        "packaging_price_snapshot" integer NOT NULL DEFAULT 0,
        "gift_message" text,
        "recipient_name" varchar(200),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_gift_orders" PRIMARY KEY ("id"),
        CONSTRAINT "fk_gift_orders_order"
          FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`CREATE INDEX "idx_gift_orders_order" ON "gift_orders" ("order_id");`);

    await queryRunner.query(`
      ALTER TABLE "products"
        ADD COLUMN "is_gift_eligible" boolean NOT NULL DEFAULT false,
        ADD COLUMN "is_gift_only" boolean NOT NULL DEFAULT false;
    `);
    await queryRunner.query(`ALTER TABLE "order_items" ADD COLUMN "gift_order_id" uuid;`);
    await queryRunner.query(`
      ALTER TABLE "order_items"
        ADD CONSTRAINT "fk_order_items_gift_order"
        FOREIGN KEY ("gift_order_id") REFERENCES "gift_orders"("id") ON DELETE SET NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT IF EXISTS "fk_order_items_gift_order";`,
    );
    await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN IF EXISTS "gift_order_id";`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "is_gift_only";`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "is_gift_eligible";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gift_orders" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gift_box_items" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gift_box_occasions" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gift_boxes" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gift_box_styles" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gift_occasions" CASCADE;`);
  }
}
