import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * RecentSearchService.record() upserts ON CONFLICT (user_id, query), but no
 * unique constraint existed on those columns, so Postgres rejected every save
 * (42P10) and recent searches were never stored. Keep the most recently used
 * row of any duplicates, then add the constraint.
 */
export class RecentSearchUserQueryUnique1794100000002 implements MigrationInterface {
  name = "RecentSearchUserQueryUnique1794100000002";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "recent_searches" r
      USING "recent_searches" newer
      WHERE r."user_id" = newer."user_id"
        AND r."query" = newer."query"
        AND (r."last_used_at", r."id") < (newer."last_used_at", newer."id")
    `);
    await queryRunner.query(
      `ALTER TABLE "recent_searches" ADD CONSTRAINT "uq_recent_searches_user_query" UNIQUE ("user_id", "query")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "recent_searches" DROP CONSTRAINT IF EXISTS "uq_recent_searches_user_query"`,
    );
  }
}
