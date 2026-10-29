import type { MigrationInterface, QueryRunner } from "typeorm";

export class RetireShippingFlatFeeSetting1780300001000 implements MigrationInterface {
  name = "RetireShippingFlatFeeSetting1780300001000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Preserve current behaviour: if no platform-default (vendor_id IS NULL,
    // zone_id IS NULL) standard rate exists, seed one from the previous flat-fee
    // values (default 15 AED / free above 150 AED) so checkout shipping is unchanged.
    const flat = await queryRunner.query(
      `SELECT value FROM site_settings WHERE key = 'shipping_flat_fee_fils' AND deleted_at IS NULL LIMIT 1;`,
    );
    const freeAbove = await queryRunner.query(
      `SELECT value FROM site_settings WHERE key = 'shipping_free_above_fils' AND deleted_at IS NULL LIMIT 1;`,
    );
    const baseCost = Number(flat?.[0]?.value ?? 1500);
    const freeAboveVal = Number(freeAbove?.[0]?.value ?? 15000);

    await queryRunner.query(
      `
      INSERT INTO shipping_rates
        (id, vendor_id, zone_id, name, method, base_cost, per_kg_cost, free_above,
         currency, estimated_days_min, estimated_days_max, is_active, sort_order,
         created_at, updated_at)
      SELECT
        gen_random_uuid(), NULL, NULL, 'Standard (platform default)', 'standard',
        $1, 0, $2, 'AED', 2, 4, true, 0, now(), now()
      WHERE NOT EXISTS (
        SELECT 1 FROM shipping_rates
        WHERE vendor_id IS NULL AND zone_id IS NULL AND method = 'standard' AND deleted_at IS NULL
      );
      `,
      [baseCost, freeAboveVal],
    );

    await queryRunner.query(
      `DELETE FROM site_settings WHERE key IN ('shipping_flat_fee_fils', 'shipping_free_above_fils');`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore the retired site settings (idempotent). The seeded platform-default
    // rate is intentionally left in place — it is valid shipping data.
    await queryRunner.query(`
      INSERT INTO site_settings (id, key, value, value_type, setting_group, description, created_at, updated_at)
      VALUES
        (gen_random_uuid(), 'shipping_flat_fee_fils', '1500', 'number', 'shipping',
         'Flat shipping fee charged per order (fils; 1500 = 15 AED).', now(), now()),
        (gen_random_uuid(), 'shipping_free_above_fils', '15000', 'number', 'shipping',
         'Cart subtotal threshold above which shipping is free (fils).', now(), now())
      ON CONFLICT (key) WHERE deleted_at IS NULL DO NOTHING;
    `);
  }
}
