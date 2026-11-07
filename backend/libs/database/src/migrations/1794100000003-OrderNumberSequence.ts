import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Order numbers were meant to come from a sequence but asked for
 * pg_get_serial_sequence('orders','id'); orders.id is a uuid, so that returned
 * NULL and every order number fell back to the last six digits of the clock
 * (collision-prone against the unique order_number) under a legacy prefix.
 * A dedicated sequence; numbers are now MH-<year>-<seq>.
 */
export class OrderNumberSequence1794100000003 implements MigrationInterface {
  name = "OrderNumberSequence1794100000003";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SEQUENCE IF NOT EXISTS "order_number_seq" START WITH 1`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SEQUENCE IF EXISTS "order_number_seq"`);
  }
}
