import type { MigrationInterface, QueryRunner } from "typeorm";

export class SeedShippingPlatformSettings1744724404000 implements MigrationInterface {
  name = "SeedShippingPlatformSettings1744724404000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO site_settings (id, key, value, value_type, setting_group, description, created_at, updated_at)
      VALUES
        (gen_random_uuid(), 'shipping_flat_fee_fils', '1500',  'number', 'shipping',
         'Flat shipping fee charged per order (fils; 1500 = 15 AED). Applied once regardless of vendor count.',
         now(), now()),
        (gen_random_uuid(), 'shipping_free_above_fils', '15000', 'number', 'shipping',
         'Cart subtotal threshold above which shipping is free (fils; 15000 = 150 AED).',
         now(), now())
      ON CONFLICT (key) WHERE deleted_at IS NULL DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM site_settings
      WHERE key IN ('shipping_flat_fee_fils', 'shipping_free_above_fils');
    `);
  }
}
