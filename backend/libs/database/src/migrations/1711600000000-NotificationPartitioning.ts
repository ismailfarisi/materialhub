import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Sprint 2 — S2-04c: Partition notifications table by month with 6-month retention.
 *
 * Converts the `notifications` table to a partitioned table (RANGE on created_at).
 * Creates partitions for the next 12 months and drops any older than 6 months.
 *
 * A scheduled job (cron) should call `create_next_notification_partition()` monthly
 * and `drop_old_notification_partitions()` to enforce the retention policy.
 */
export class NotificationPartitioning1711600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Rename existing table
    await queryRunner.query(`ALTER TABLE IF EXISTS "notifications" RENAME TO "notifications_old"`);

    // Step 2: Create partitioned table with same schema
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "type" "notification_type" NOT NULL,
        "channel" "notification_channel" NOT NULL DEFAULT 'in_app',
        "title" varchar(255) NOT NULL,
        "body" text NOT NULL,
        "data" jsonb,
        "action_url" varchar(1024),
        "is_read" boolean NOT NULL DEFAULT false,
        "read_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        PRIMARY KEY ("id", "created_at")
      ) PARTITION BY RANGE ("created_at")
    `);

    // Step 3: Create partitions for current month + next 12 months
    const now = new Date();
    for (let i = -1; i <= 12; i++) {
      const start = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
      const suffix = `${start.getFullYear()}_${String(start.getMonth() + 1).padStart(2, "0")}`;

      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "notifications_${suffix}"
        PARTITION OF "notifications"
        FOR VALUES FROM ('${start.toISOString()}') TO ('${end.toISOString()}')
      `);
    }

    // Step 4: Migrate existing data
    await queryRunner.query(`
      INSERT INTO "notifications" SELECT * FROM "notifications_old"
    `);

    // Step 5: Create indexes on partitioned table
    await queryRunner.query(`
      CREATE INDEX "idx_notifications_user_id" ON "notifications" ("user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_notifications_user_read" ON "notifications" ("user_id", "is_read")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_notifications_created_at" ON "notifications" ("created_at")
    `);

    // Step 6: Drop old table
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications_old"`);

    // Step 7: Helper function to create future partitions (call monthly via cron)
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION create_next_notification_partition()
      RETURNS void AS $$
      DECLARE
        next_month date := date_trunc('month', now() + interval '1 month');
        partition_name text;
        start_date text;
        end_date text;
      BEGIN
        partition_name := 'notifications_' || to_char(next_month, 'YYYY_MM');
        start_date := to_char(next_month, 'YYYY-MM-DD');
        end_date := to_char(next_month + interval '1 month', 'YYYY-MM-DD');

        EXECUTE format(
          'CREATE TABLE IF NOT EXISTS %I PARTITION OF notifications FOR VALUES FROM (%L) TO (%L)',
          partition_name, start_date, end_date
        );
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Step 8: Helper function to drop old partitions (6-month retention)
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION drop_old_notification_partitions()
      RETURNS void AS $$
      DECLARE
        cutoff date := date_trunc('month', now() - interval '6 months');
        r record;
      BEGIN
        FOR r IN
          SELECT inhrelid::regclass::text AS partition_name
          FROM pg_inherits
          WHERE inhparent = 'notifications'::regclass
        LOOP
          -- Extract the date from partition name (notifications_YYYY_MM)
          IF r.partition_name ~ 'notifications_[0-9]{4}_[0-9]{2}' THEN
            DECLARE
              partition_date date;
            BEGIN
              partition_date := to_date(
                substring(r.partition_name from 'notifications_([0-9]{4}_[0-9]{2})'),
                'YYYY_MM'
              );
              IF partition_date < cutoff THEN
                EXECUTE format('DROP TABLE IF EXISTS %I', r.partition_name);
              END IF;
            END;
          END IF;
        END LOOP;
      END;
      $$ LANGUAGE plpgsql;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Create unpartitioned table and migrate data back
    await queryRunner.query(
      `ALTER TABLE IF EXISTS "notifications" RENAME TO "notifications_partitioned"`,
    );

    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        "user_id" uuid NOT NULL,
        "type" "notification_type" NOT NULL,
        "channel" "notification_channel" NOT NULL DEFAULT 'in_app',
        "title" varchar(255) NOT NULL,
        "body" text NOT NULL,
        "data" jsonb,
        "action_url" varchar(1024),
        "is_read" boolean NOT NULL DEFAULT false,
        "read_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz
      )
    `);

    await queryRunner.query(`
      INSERT INTO "notifications" SELECT * FROM "notifications_partitioned"
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "notifications_partitioned" CASCADE`);
    await queryRunner.query("DROP FUNCTION IF EXISTS create_next_notification_partition()");
    await queryRunner.query("DROP FUNCTION IF EXISTS drop_old_notification_partitions()");
  }
}
