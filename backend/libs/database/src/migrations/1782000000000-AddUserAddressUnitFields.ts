import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserAddressUnitFields1782000000000 implements MigrationInterface {
  name = "AddUserAddressUnitFields1782000000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "user_addresses"
        ADD COLUMN "building_name" varchar(150),
        ADD COLUMN "apartment" varchar(50),
        ADD COLUMN "floor" varchar(50);
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "user_addresses"
        DROP COLUMN "floor",
        DROP COLUMN "apartment",
        DROP COLUMN "building_name";
    `);
  }
}
