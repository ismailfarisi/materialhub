import type { MigrationInterface, QueryRunner } from "typeorm";

export class SupportTicketsGuestCapable1782000000000 implements MigrationInterface {
  name = "SupportTicketsGuestCapable1782000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "support_tickets"
        ALTER COLUMN "user_id" DROP NOT NULL,
        ADD COLUMN "guest_session" varchar(255),
        ADD COLUMN "guest_email" varchar(255),
        ADD COLUMN "guest_name" varchar(255);
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_support_tickets_guest_session"
        ON "support_tickets" ("guest_session")
        WHERE "deleted_at" IS NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE "support_messages"
        ALTER COLUMN "sender_id" DROP NOT NULL;
    `);
    // A ticket must be owned by either a user or a guest session.
    await queryRunner.query(`
      ALTER TABLE "support_tickets"
        ADD CONSTRAINT "support_tickets_owner_present"
        CHECK ("user_id" IS NOT NULL OR "guest_session" IS NOT NULL);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "support_tickets" DROP CONSTRAINT "support_tickets_owner_present";`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_messages" ALTER COLUMN "sender_id" SET NOT NULL;`,
    );
    await queryRunner.query(`DROP INDEX "idx_support_tickets_guest_session";`);
    await queryRunner.query(`
      ALTER TABLE "support_tickets"
        DROP COLUMN "guest_name",
        DROP COLUMN "guest_email",
        DROP COLUMN "guest_session",
        ALTER COLUMN "user_id" SET NOT NULL;
    `);
  }
}
