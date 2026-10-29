import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddShippingContributionColumns1781600000000 implements MigrationInterface {
  name = "AddShippingContributionColumns1781600000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE vendor_orders
        ADD COLUMN shipping_contribution integer NOT NULL DEFAULT 0;
    `);
    await q.query(`
      ALTER TABLE vendor_payouts
        ADD COLUMN shipping_contribution_total integer NOT NULL DEFAULT 0;
    `);
    // Configurable Postaplus base cost (AED 13 = 1300 fils), for the
    // "MaterialHub UAE absorbs" display/reporting. Idempotent on re-run.
    await q.query(`
      INSERT INTO site_settings ("key", "value", "value_type", "setting_group", "description")
      VALUES (
        'shipping.base_carrier_cost_fils', '1300', 'integer', 'shipping',
        'Postaplus base carrier cost per shipment, in fils. Reference for vendor-absorbed shipping display.'
      )
      ON CONFLICT ("key") WHERE "deleted_at" IS NULL DO NOTHING;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM site_settings WHERE "key" = 'shipping.base_carrier_cost_fils';`);
    await q.query("ALTER TABLE vendor_payouts DROP COLUMN shipping_contribution_total;");
    await q.query("ALTER TABLE vendor_orders DROP COLUMN shipping_contribution;");
  }
}
