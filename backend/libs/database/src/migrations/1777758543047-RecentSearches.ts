import type { MigrationInterface, QueryRunner } from "typeorm";

export class RecentSearches1777758543047 implements MigrationInterface {
  name = "RecentSearches1777758543047";

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE recent_searches (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        query        text NOT NULL,
        last_used_at timestamptz NOT NULL DEFAULT now(),
        created_at   timestamptz NOT NULL DEFAULT now(),
        UNIQUE (user_id, query)
      )
    `);
    await qr.query(`
      CREATE INDEX recent_searches_user_recent_idx
        ON recent_searches (user_id, last_used_at DESC)
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query("DROP TABLE recent_searches");
  }
}
