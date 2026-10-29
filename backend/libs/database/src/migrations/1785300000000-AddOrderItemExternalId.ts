import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddOrderItemExternalId1785300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE order_items
        ADD COLUMN external_id varchar(128) NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE order_items
        DROP COLUMN IF EXISTS external_id;
    `);
  }
}
