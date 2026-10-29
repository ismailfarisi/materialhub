import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateShippingContributionTiers1781500000000 implements MigrationInterface {
  name = "CreateShippingContributionTiers1781500000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "shipping_contribution_tiers" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "vendor_id" uuid,
        "min_order_value" integer NOT NULL,
        "vendor_contribution" integer NOT NULL,
        "currency" char(3) NOT NULL DEFAULT 'AED',
        "is_active" boolean NOT NULL DEFAULT true,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_shipping_contribution_tiers" PRIMARY KEY ("id"),
        CONSTRAINT "shipping_contribution_tiers_min_nonneg" CHECK ("min_order_value" >= 0),
        CONSTRAINT "shipping_contribution_tiers_contribution_nonneg" CHECK ("vendor_contribution" >= 0),
        CONSTRAINT "fk_shipping_contribution_tier_vendor"
          FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE
      );`);

    // One band per threshold per scope. NULL vendor_id (global) rows are
    // distinct under a plain unique index, so coalesce to a sentinel uuid.
    await q.query(`
      CREATE UNIQUE INDEX "uq_shipping_contribution_tier_scope_threshold"
        ON "shipping_contribution_tiers"
        (COALESCE("vendor_id", '00000000-0000-0000-0000-000000000000'::uuid), "min_order_value")
        WHERE "deleted_at" IS NULL;`);

    await q.query(`CREATE INDEX "idx_shipping_contribution_tier_vendor"
      ON "shipping_contribution_tiers" ("vendor_id") WHERE "deleted_at" IS NULL;`);

    // Seed the global default schedule (Schedule A), in fils.
    await q.query(`
      INSERT INTO "shipping_contribution_tiers"
        ("vendor_id", "min_order_value", "vendor_contribution", "sort_order")
      VALUES
        (NULL, 0,     300,  0),
        (NULL, 2100,  500,  1),
        (NULL, 5100,  800,  2),
        (NULL, 12100, 1000, 3);`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "shipping_contribution_tiers" CASCADE;`);
  }
}
