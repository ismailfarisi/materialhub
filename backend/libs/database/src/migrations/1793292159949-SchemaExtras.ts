import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Hand-written schema pieces that TypeORM cannot express from the entities:
 *
 * - Postgres extensions used by search (pg_trgm, unaccent) and crypto (pgcrypto).
 * - `notifications` (entity marked synchronize:false) as a monthly range-partitioned
 *   table with its enums; the partitioned table's key is (id, created_at),
 *   with the two maintenance functions notification-service calls from its
 *   partition job.
 * - The checkout pricing-rules epoch: a single-row table that is bumped by
 *   triggers whenever BNPL thresholds or shipping rates change, so cached quotes
 *   can be invalidated.
 * - `brands.product_count` kept in sync by triggers on `products`.
 *
 * Runs right after InitialSchema on an empty database; every statement is
 * written so it can be re-run safely.
 */
export class SchemaExtras1793292159949 implements MigrationInterface {
  name = "SchemaExtras1793292159949";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Extensions ──────────────────────────────────────────────────
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pg_trgm"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "unaccent"`);

    // ── notifications: monthly partitions ───────────────────────────
    // InitialSchema creates a plain table; nothing references it, so replace it.
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
    await queryRunner.query(
      `DO $$ BEGIN
        CREATE TYPE "public"."notifications_type_enum" AS ENUM('order_update', 'payment', 'promotion', 'system', 'vendor', 'order_confirmed', 'order_shipped', 'order_delivered', 'payment_received', 'payout_sent', 'new_review', 'low_stock', 'vendor_approved', 'return_requested', 'dispute_opened', 'dispute_resolved', 'vendor_new_order');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    );
    await queryRunner.query(
      `DO $$ BEGIN
        CREATE TYPE "public"."notifications_channel_enum" AS ENUM('email', 'push', 'sms', 'in_app', 'whatsapp');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    );
    await queryRunner.query(
      `CREATE TABLE "notifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "type" "public"."notifications_type_enum" NOT NULL,
        "channel" "public"."notifications_channel_enum" NOT NULL DEFAULT 'in_app',
        "title" character varying(255) NOT NULL,
        "body" text NOT NULL,
        "data" jsonb,
        "is_read" boolean NOT NULL DEFAULT false,
        "read_at" TIMESTAMP WITH TIME ZONE,
        "action_url" character varying(1024),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_notifications" PRIMARY KEY ("id", "created_at")
      ) PARTITION BY RANGE ("created_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_notifications_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_user_unread" ON "notifications" ("user_id", "is_read", "created_at" DESC)`,
    );

    // Partitions from the previous month through twelve months ahead.
    const start = new Date();
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCMonth(start.getUTCMonth() - 1);
    for (let i = 0; i < 14; i++) {
      const from = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
      const to = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i + 1, 1));
      const name = `notifications_${from.getUTCFullYear()}_${String(from.getUTCMonth() + 1).padStart(2, "0")}`;
      await queryRunner.query(
        `CREATE TABLE IF NOT EXISTS "${name}" PARTITION OF "notifications" FOR VALUES FROM ('${from.toISOString()}') TO ('${to.toISOString()}')`,
      );
    }

    await queryRunner.query(`CREATE OR REPLACE FUNCTION create_next_notification_partition()
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
      $$ LANGUAGE plpgsql`);

    await queryRunner.query(`CREATE OR REPLACE FUNCTION drop_old_notification_partitions()
      RETURNS void AS $$
      DECLARE
        cutoff date := date_trunc('month', now() - interval '6 months');
        r record;
        partition_date date;
      BEGIN
        FOR r IN
          SELECT inhrelid::regclass::text AS partition_name
          FROM pg_inherits
          WHERE inhparent = 'notifications'::regclass
        LOOP
          IF r.partition_name ~ 'notifications_[0-9]{4}_[0-9]{2}' THEN
            partition_date := to_date(
              substring(r.partition_name from 'notifications_([0-9]{4}_[0-9]{2})'),
              'YYYY_MM'
            );
            IF partition_date < cutoff THEN
              EXECUTE format('DROP TABLE IF EXISTS %I', r.partition_name);
            END IF;
          END IF;
        END LOOP;
      END;
      $$ LANGUAGE plpgsql`);

    // ── Checkout pricing-rules epoch ────────────────────────────────
    await queryRunner.query(
      `INSERT INTO "rules_epoch" ("id", "epoch") VALUES (1, 0) ON CONFLICT ("id") DO NOTHING`,
    );
    await queryRunner.query(`CREATE OR REPLACE FUNCTION bump_rules_epoch() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        UPDATE rules_epoch SET epoch = epoch + 1, updated_at = now() WHERE id = 1;
        RETURN COALESCE(NEW, OLD);
      END;
      $$`);
    await queryRunner.query(
      "DROP TRIGGER IF EXISTS trg_bump_rules_epoch_thresholds ON payment_method_thresholds",
    );
    await queryRunner.query(`CREATE TRIGGER trg_bump_rules_epoch_thresholds
      AFTER INSERT OR UPDATE OR DELETE ON payment_method_thresholds
      FOR EACH ROW EXECUTE FUNCTION bump_rules_epoch()`);
    await queryRunner.query(
      "DROP TRIGGER IF EXISTS trg_bump_rules_epoch_shipping_rates ON shipping_rates",
    );
    await queryRunner.query(`CREATE TRIGGER trg_bump_rules_epoch_shipping_rates
      AFTER INSERT OR UPDATE OR DELETE ON shipping_rates
      FOR EACH ROW EXECUTE FUNCTION bump_rules_epoch()`);

    // ── brands.product_count sync ───────────────────────────────────
    await queryRunner.query(`CREATE OR REPLACE FUNCTION sync_brand_product_count_on_change()
      RETURNS TRIGGER AS $$
      DECLARE
        ids uuid[] := ARRAY[]::uuid[];
      BEGIN
        IF TG_OP <> 'DELETE' AND NEW.brand_id IS NOT NULL THEN
          ids := array_append(ids, NEW.brand_id);
        END IF;
        IF TG_OP <> 'INSERT' AND OLD.brand_id IS NOT NULL
           AND (TG_OP = 'DELETE' OR OLD.brand_id IS DISTINCT FROM NEW.brand_id) THEN
          ids := array_append(ids, OLD.brand_id);
        END IF;
        IF array_length(ids, 1) IS NULL THEN
          RETURN NULL;
        END IF;
        UPDATE brands b
           SET product_count = COALESCE((
             SELECT COUNT(*)::int
               FROM products p
              WHERE p.brand_id = b.id
                AND p.status = 'published'
                AND p.deleted_at IS NULL
           ), 0)
         WHERE b.id = ANY(ids);
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql`);
    await queryRunner.query("DROP TRIGGER IF EXISTS trg_sync_brand_product_count_ins ON products");
    await queryRunner.query("DROP TRIGGER IF EXISTS trg_sync_brand_product_count_del ON products");
    await queryRunner.query("DROP TRIGGER IF EXISTS trg_sync_brand_product_count_upd ON products");
    await queryRunner.query(`CREATE TRIGGER trg_sync_brand_product_count_ins
      AFTER INSERT ON products FOR EACH ROW
      EXECUTE FUNCTION sync_brand_product_count_on_change()`);
    await queryRunner.query(`CREATE TRIGGER trg_sync_brand_product_count_del
      AFTER DELETE ON products FOR EACH ROW
      EXECUTE FUNCTION sync_brand_product_count_on_change()`);
    await queryRunner.query(`CREATE TRIGGER trg_sync_brand_product_count_upd
      AFTER UPDATE OF brand_id, status, deleted_at ON products
      FOR EACH ROW
      WHEN (OLD.brand_id IS DISTINCT FROM NEW.brand_id
         OR OLD.status IS DISTINCT FROM NEW.status
         OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
      EXECUTE FUNCTION sync_brand_product_count_on_change()`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TRIGGER IF EXISTS trg_sync_brand_product_count_upd ON products");
    await queryRunner.query("DROP TRIGGER IF EXISTS trg_sync_brand_product_count_del ON products");
    await queryRunner.query("DROP TRIGGER IF EXISTS trg_sync_brand_product_count_ins ON products");
    await queryRunner.query("DROP FUNCTION IF EXISTS sync_brand_product_count_on_change()");
    await queryRunner.query(
      "DROP TRIGGER IF EXISTS trg_bump_rules_epoch_shipping_rates ON shipping_rates",
    );
    await queryRunner.query(
      "DROP TRIGGER IF EXISTS trg_bump_rules_epoch_thresholds ON payment_method_thresholds",
    );
    await queryRunner.query("DROP FUNCTION IF EXISTS bump_rules_epoch()");
    await queryRunner.query("DROP FUNCTION IF EXISTS drop_old_notification_partitions()");
    await queryRunner.query("DROP FUNCTION IF EXISTS create_next_notification_partition()");
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."notifications_channel_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."notifications_type_enum"`);
  }
}
