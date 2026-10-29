import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddShippingProviders1744724407000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE shipping_providers (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code             varchar(50)  NOT NULL,
        display_name     varchar(255) NOT NULL,
        description      text         NULL,
        logo_url         text         NULL,
        credential_schema jsonb       NOT NULL,
        supported_regions text[]      NOT NULL DEFAULT '{}',
        webhook_secret_encrypted varchar(512) NULL,
        is_active        boolean      NOT NULL DEFAULT false,
        sort_order       integer      NOT NULL DEFAULT 0,
        created_at       timestamptz  NOT NULL DEFAULT now(),
        updated_at       timestamptz  NOT NULL DEFAULT now(),
        deleted_at       timestamptz  NULL
      );
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX shipping_providers_code_uq
        ON shipping_providers (code) WHERE deleted_at IS NULL;
    `);

    await queryRunner.query(`
      CREATE TABLE vendor_carrier_accounts (
        id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        vendor_id              uuid         NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
        provider_id            uuid         NOT NULL REFERENCES shipping_providers(id) ON DELETE RESTRICT,
        display_name           varchar(255) NOT NULL,
        credentials_encrypted  text         NOT NULL,
        credentials_last4      varchar(8)   NULL,
        is_active              boolean      NOT NULL DEFAULT true,
        is_verified            boolean      NOT NULL DEFAULT false,
        verified_at            timestamptz  NULL,
        last_verify_error      text         NULL,
        created_at             timestamptz  NOT NULL DEFAULT now(),
        updated_at             timestamptz  NOT NULL DEFAULT now(),
        deleted_at             timestamptz  NULL
      );
    `);
    await queryRunner.query(`
      CREATE INDEX vendor_carrier_accounts_vendor_idx
        ON vendor_carrier_accounts(vendor_id) WHERE deleted_at IS NULL;
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX vendor_carrier_accounts_vendor_provider_uq
        ON vendor_carrier_accounts (vendor_id, provider_id) WHERE deleted_at IS NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE vendors
        ADD COLUMN default_shipping_account_id uuid NULL
          REFERENCES vendor_carrier_accounts(id) ON DELETE SET NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE vendors DROP COLUMN IF EXISTS default_shipping_account_id;
    `);
    await queryRunner.query("DROP TABLE IF EXISTS vendor_carrier_accounts;");
    await queryRunner.query("DROP TABLE IF EXISTS shipping_providers;");
  }
}
