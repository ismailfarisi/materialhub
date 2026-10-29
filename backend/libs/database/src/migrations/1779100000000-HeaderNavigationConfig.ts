import type { MigrationInterface, QueryRunner } from "typeorm";

export class HeaderNavigationConfig1779100000000 implements MigrationInterface {
  name = "HeaderNavigationConfig1779100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "header_navigation_configs" (
        "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "version"      integer NOT NULL DEFAULT 1,
        "status"       varchar(20) NOT NULL DEFAULT 'draft',
        "published_at" timestamptz NULL,
        "config"       jsonb NOT NULL,
        "created_by"   uuid NOT NULL,
        "created_at"   timestamptz NOT NULL DEFAULT now(),
        "updated_at"   timestamptz NOT NULL DEFAULT now(),
        "deleted_at"   timestamptz NULL
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "uniq_header_nav_published"
        ON "header_navigation_configs" ("status")
        WHERE status = 'published' AND deleted_at IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uniq_header_nav_published"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "header_navigation_configs"`);
  }
}
