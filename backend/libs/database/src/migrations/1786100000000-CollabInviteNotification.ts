import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Collab invites become a notification, and carry the vendor's note.
 *
 * `notification_type` is the shared Postgres enum behind `notifications.type`
 * and `notification_preferences.notification_type`. Postgres 12+ allows
 * `ALTER TYPE ... ADD VALUE` inside a transaction as long as the new value is
 * not *used* in the same transaction (it isn't) — same shape as
 * 1784700000000-AddWhatsappNotificationChannel.
 */
export class CollabInviteNotification1786100000000 implements MigrationInterface {
  name = "CollabInviteNotification1786100000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'collab_invited'`);

    await q.query(`ALTER TABLE "collab_applications" ADD COLUMN IF NOT EXISTS "invite_note" text;`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "collab_applications" DROP COLUMN IF EXISTS "invite_note";`);
    // Postgres cannot drop an enum value without recreating the type. Leaving
    // 'collab_invited' in place is harmless after a rollback.
  }
}
