import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateOrderItemCancellations1782000000000 implements MigrationInterface {
  name = "CreateOrderItemCancellations1782000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "order_item_cancellations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "order_id" uuid NOT NULL,
        "admin_id" uuid NOT NULL,
        "reason" text NOT NULL,
        "refund_amount" integer NOT NULL,
        "currency" char(3) NOT NULL DEFAULT 'AED',
        "refund_method" varchar(30) NOT NULL,
        "gateway_refund_id" varchar(255),
        "status" varchar(20) NOT NULL DEFAULT 'completed',
        "items" jsonb NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_order_item_cancellations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_oic_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id"),
        CONSTRAINT "FK_oic_admin" FOREIGN KEY ("admin_id") REFERENCES "users"("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_oic_order_id" ON "order_item_cancellations" ("order_id") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_oic_created_at" ON "order_item_cancellations" ("created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "order_item_cancellations"`);
  }
}
