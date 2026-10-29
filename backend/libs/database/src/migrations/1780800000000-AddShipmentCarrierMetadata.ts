import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddShipmentCarrierMetadata1780800000000 implements MigrationInterface {
  name = "AddShipmentCarrierMetadata1780800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "shipments"
        ADD COLUMN "label_url" varchar(1024),
        ADD COLUMN "pickup_code" varchar(100);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "shipments"
        DROP COLUMN IF EXISTS "pickup_code",
        DROP COLUMN IF EXISTS "label_url";
    `);
  }
}
