import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddInventoryMovementExternalChangeId1746000006000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventory_movements
        ADD COLUMN IF NOT EXISTS external_change_id varchar(128) NULL;
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS inventory_movements_external_change_uq
        ON inventory_movements (product_id, external_change_id)
        WHERE external_change_id IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP INDEX IF EXISTS inventory_movements_external_change_uq;");
    await queryRunner.query(
      "ALTER TABLE inventory_movements DROP COLUMN IF EXISTS external_change_id;",
    );
  }
}
