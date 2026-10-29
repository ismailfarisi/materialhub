import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddTrendingReelsSectionType1744552800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "section_types" ("name", "label", "icon", "supports_bidding", "default_settings")
      VALUES (
        'trending_reels',
        '{"en":"Trending Reels"}',
        'play',
        false,
        '{"title":{"en":"Trending Reels"},"subtitle":{"en":"See what''s inspiring the community"}}'
      )
      ON CONFLICT ("name") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "section_types" WHERE "name" = 'trending_reels'`);
  }
}
