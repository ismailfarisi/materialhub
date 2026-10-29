import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddAttributeFilterInputType1745068800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "attributes_filter_input_type_enum" AS ENUM (
        'checkbox', 'color_swatch', 'radio', 'range', 'toggle'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "attributes"
      ADD COLUMN "filter_input_type" "attributes_filter_input_type_enum" NULL
    `);
    await queryRunner.query(`
      UPDATE "attributes"
      SET "filter_input_type" = CASE
        WHEN "type" = 'color' THEN 'color_swatch'::attributes_filter_input_type_enum
        WHEN "type" = 'number' THEN 'range'::attributes_filter_input_type_enum
        WHEN "type" = 'boolean' THEN 'toggle'::attributes_filter_input_type_enum
        WHEN "type" IN ('select', 'multi_select') THEN 'checkbox'::attributes_filter_input_type_enum
        ELSE NULL
      END
      WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "attributes" DROP COLUMN "filter_input_type"`);
    await queryRunner.query(`DROP TYPE "attributes_filter_input_type_enum"`);
  }
}
