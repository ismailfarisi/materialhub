import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddOrderInvoiceColumns1785200000000 implements MigrationInterface {
  name = "AddOrderInvoiceColumns1785200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders"
        ADD COLUMN "invoice_s3_key" varchar(1024),
        ADD COLUMN "invoice_generated_at" timestamptz,
        ADD COLUMN "invoice_last_error" text;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders"
        DROP COLUMN "invoice_last_error",
        DROP COLUMN "invoice_generated_at",
        DROP COLUMN "invoice_s3_key";
    `);
  }
}
