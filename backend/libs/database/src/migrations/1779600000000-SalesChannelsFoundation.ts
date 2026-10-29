import type { MigrationInterface, QueryRunner } from "typeorm";

export class SalesChannelsFoundation1779600000000 implements MigrationInterface {
  name = "SalesChannelsFoundation1779600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── Enum types ───
    await queryRunner.query(
      `CREATE TYPE sales_channel_code AS ENUM ('google_merchant','meta_catalog','tiktok')`,
    );
    await queryRunner.query(
      `CREATE TYPE channel_sync_status AS ENUM ('pending','synced','excluded','error')`,
    );
    await queryRunner.query(
      `CREATE TYPE channel_review_status AS ENUM ('pending','approved','disapproved')`,
    );
    await queryRunner.query(`CREATE TYPE channel_delivery_kind AS ENUM ('delta','conversion')`);

    // ─── sales_channels ───
    await queryRunner.query(`
      CREATE TABLE sales_channels (
        id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code                   sales_channel_code NOT NULL,
        display_name           varchar(100) NOT NULL,
        is_enabled             boolean NOT NULL DEFAULT false,
        credentials_encrypted  text NULL,
        config                 jsonb NOT NULL DEFAULT '{}'::jsonb,
        feed_url               text NULL,
        feed_format            varchar(8) NOT NULL DEFAULT 'xml',
        delta_enabled          boolean NOT NULL DEFAULT true,
        last_full_feed_at      timestamptz NULL,
        last_full_feed_status  varchar(16) NULL,
        last_delta_success_at  timestamptz NULL,
        degraded_until         timestamptz NULL,
        created_at             timestamptz NOT NULL DEFAULT now(),
        updated_at             timestamptz NOT NULL DEFAULT now(),
        deleted_at             timestamptz NULL
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX sales_channels_code_uq
        ON sales_channels (code) WHERE deleted_at IS NULL
    `);

    // ─── channel_listings ───
    await queryRunner.query(`
      CREATE TABLE channel_listings (
        id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        channel_id           uuid NOT NULL REFERENCES sales_channels(id) ON DELETE CASCADE,
        product_id           uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        variant_id           uuid NULL REFERENCES product_variants(id) ON DELETE CASCADE,
        offer_id             varchar(128) NOT NULL,
        sync_status          channel_sync_status NOT NULL DEFAULT 'pending',
        review_status        channel_review_status NOT NULL DEFAULT 'pending',
        disapproval_reasons  jsonb NULL,
        content_hash         varchar(64) NULL,
        excluded             boolean NOT NULL DEFAULT false,
        exclusion_reason     varchar(255) NULL,
        last_synced_at       timestamptz NULL,
        created_at           timestamptz NOT NULL DEFAULT now(),
        updated_at           timestamptz NOT NULL DEFAULT now(),
        deleted_at           timestamptz NULL
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX channel_listings_offer_variant_uq
        ON channel_listings (channel_id, product_id, variant_id)
        WHERE deleted_at IS NULL AND variant_id IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX channel_listings_offer_base_uq
        ON channel_listings (channel_id, product_id)
        WHERE deleted_at IS NULL AND variant_id IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX channel_listings_review_idx
        ON channel_listings (channel_id, review_status)
    `);

    // ─── channel_category_mappings ───
    await queryRunner.query(`
      CREATE TABLE channel_category_mappings (
        id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        channel_id              uuid NOT NULL REFERENCES sales_channels(id) ON DELETE CASCADE,
        category_id             uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        external_category_id    varchar(64) NOT NULL,
        external_category_path  text NULL,
        created_at              timestamptz NOT NULL DEFAULT now(),
        updated_at              timestamptz NOT NULL DEFAULT now(),
        deleted_at              timestamptz NULL
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX channel_category_mappings_uq
        ON channel_category_mappings (channel_id, category_id)
        WHERE deleted_at IS NULL
    `);

    // ─── channel_feed_runs ───
    await queryRunner.query(`
      CREATE TABLE channel_feed_runs (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        channel_id       uuid NOT NULL REFERENCES sales_channels(id) ON DELETE CASCADE,
        started_at       timestamptz NOT NULL,
        finished_at      timestamptz NULL,
        status           varchar(16) NOT NULL,
        item_count       integer NOT NULL DEFAULT 0,
        excluded_count   integer NOT NULL DEFAULT 0,
        error_count      integer NOT NULL DEFAULT 0,
        file_url         text NULL,
        file_size_bytes  integer NULL,
        trigger          varchar(8) NOT NULL,
        error_message    text NULL,
        created_at       timestamptz NOT NULL DEFAULT now(),
        updated_at       timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX channel_feed_runs_channel_created_idx
        ON channel_feed_runs (channel_id, created_at)
    `);

    // ─── channel_deliveries ───
    await queryRunner.query(`
      CREATE TABLE channel_deliveries (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        channel_id       uuid NOT NULL REFERENCES sales_channels(id) ON DELETE CASCADE,
        kind             channel_delivery_kind NOT NULL,
        event_name       varchar(48) NULL,
        dedup_event_id   varchar(64) NULL,
        order_id         uuid NULL REFERENCES orders(id) ON DELETE SET NULL,
        product_id       uuid NULL REFERENCES products(id) ON DELETE SET NULL,
        payload          jsonb NULL,
        response_status  integer NULL,
        status           varchar(16) NOT NULL,
        latency_ms       integer NULL,
        attempt          smallint NOT NULL DEFAULT 1,
        error_message    text NULL,
        created_at       timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX channel_deliveries_channel_created_idx
        ON channel_deliveries (channel_id, created_at)
    `);

    // ─── vendors opt-out column ───
    await queryRunner.query(`
      ALTER TABLE vendors
        ADD COLUMN exclude_from_channel_feeds boolean NOT NULL DEFAULT false
    `);

    // ─── seed the three channel rows ───
    await queryRunner.query(`
      INSERT INTO sales_channels (code, display_name) VALUES
        ('google_merchant', 'Google Merchant Center'),
        ('meta_catalog',    'Meta Catalog'),
        ('tiktok',          'TikTok')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE vendors DROP COLUMN IF EXISTS exclude_from_channel_feeds");
    await queryRunner.query("DROP INDEX IF EXISTS channel_deliveries_channel_created_idx");
    await queryRunner.query("DROP TABLE IF EXISTS channel_deliveries");
    await queryRunner.query("DROP INDEX IF EXISTS channel_feed_runs_channel_created_idx");
    await queryRunner.query("DROP TABLE IF EXISTS channel_feed_runs");
    await queryRunner.query("DROP INDEX IF EXISTS channel_category_mappings_uq");
    await queryRunner.query("DROP TABLE IF EXISTS channel_category_mappings");
    await queryRunner.query("DROP INDEX IF EXISTS channel_listings_review_idx");
    await queryRunner.query("DROP INDEX IF EXISTS channel_listings_offer_base_uq");
    await queryRunner.query("DROP INDEX IF EXISTS channel_listings_offer_variant_uq");
    await queryRunner.query("DROP TABLE IF EXISTS channel_listings");
    await queryRunner.query("DROP INDEX IF EXISTS sales_channels_code_uq");
    await queryRunner.query("DROP TABLE IF EXISTS sales_channels");
    await queryRunner.query("DROP TYPE IF EXISTS channel_delivery_kind");
    await queryRunner.query("DROP TYPE IF EXISTS channel_review_status");
    await queryRunner.query("DROP TYPE IF EXISTS channel_sync_status");
    await queryRunner.query("DROP TYPE IF EXISTS sales_channel_code");
  }
}
