import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddWhatsappNotificationChannel1784700000000 implements MigrationInterface {
  name = "AddWhatsappNotificationChannel1784700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // IF NOT EXISTS is idempotent and non-locking on Postgres ≥ 12.
    // One value per statement — ADD VALUE cannot be batched.
    await queryRunner.query(`ALTER TYPE "notification_channel" ADD VALUE IF NOT EXISTS 'whatsapp'`);
    await queryRunner.query(
      `ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'vendor_new_order'`,
    );
  }

  public async down(): Promise<void> {
    // Postgres cannot drop enum values without recreating the type. Acceptable —
    // these values are harmless if left in place after a rollback.
  }
}
