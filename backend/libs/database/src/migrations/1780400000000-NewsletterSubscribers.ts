import type { MigrationInterface, QueryRunner } from "typeorm";

export class NewsletterSubscribers1780400000000 implements MigrationInterface {
  name = "NewsletterSubscribers1780400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "newsletter_subscribers" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" text NOT NULL,
        "user_id" uuid,
        "locale" text NOT NULL DEFAULT 'en',
        "source" text NOT NULL DEFAULT 'homepage',
        "subscribed_at" timestamptz NOT NULL DEFAULT now(),
        "unsubscribed_at" timestamptz,
        "unsubscribe_token" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_newsletter_subscribers" PRIMARY KEY ("id"),
        CONSTRAINT "fk_newsletter_subscribers_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_newsletter_subscribers_email_active"
        ON "newsletter_subscribers" ("email") WHERE "deleted_at" IS NULL;
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_newsletter_subscribers_token"
        ON "newsletter_subscribers" ("unsubscribe_token");
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_newsletter_subscribers_user"
        ON "newsletter_subscribers" ("user_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "newsletter_subscribers" CASCADE;`);
  }
}
