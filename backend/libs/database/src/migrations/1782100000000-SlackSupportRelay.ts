import type { MigrationInterface, QueryRunner } from "typeorm";

export class SlackSupportRelay1782100000000 implements MigrationInterface {
  name = "SlackSupportRelay1782100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "support_tickets"
        ADD COLUMN "slack_channel_id" varchar(64),
        ADD COLUMN "slack_thread_ts" varchar(64);
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_support_tickets_slack_thread"
        ON "support_tickets" ("slack_thread_ts")
        WHERE "deleted_at" IS NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE "support_messages"
        ADD COLUMN "origin" varchar(16) NOT NULL DEFAULT 'app';
    `);
    // Seed a disabled slack settings row (no secrets yet).
    await queryRunner.query(`
      INSERT INTO "site_settings" ("key", "value", "value_type", "setting_group", "description")
      VALUES ('slack_support', '{"enabled":false}', 'json', 'slack', 'Slack support relay configuration')
      ON CONFLICT DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "site_settings" WHERE "key" = 'slack_support';`);
    await queryRunner.query(`ALTER TABLE "support_messages" DROP COLUMN "origin";`);
    await queryRunner.query(`DROP INDEX "idx_support_tickets_slack_thread";`);
    await queryRunner.query(`
      ALTER TABLE "support_tickets"
        DROP COLUMN "slack_thread_ts",
        DROP COLUMN "slack_channel_id";
    `);
  }
}
