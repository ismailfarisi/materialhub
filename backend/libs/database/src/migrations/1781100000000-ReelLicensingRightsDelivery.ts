import type { MigrationInterface, QueryRunner } from "typeorm";

export class ReelLicensingRightsDelivery1781100000000 implements MigrationInterface {
  name = "ReelLicensingRightsDelivery1781100000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "reel_license_features" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "grant_id" uuid NOT NULL,
        "reel_id" uuid NOT NULL,
        "vendor_id" uuid NOT NULL,
        "placement" varchar(12) NOT NULL,
        "product_id" uuid,
        "position" int NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_reel_license_features" PRIMARY KEY ("id"),
        CONSTRAINT "fk_rlf_grant" FOREIGN KEY ("grant_id")
          REFERENCES "reel_license_grants"("id") ON DELETE CASCADE
      );`);
    await q.query(
      `CREATE UNIQUE INDEX "uq_rlf_surface" ON "reel_license_features" ("grant_id","placement","product_id") WHERE "deleted_at" IS NULL;`,
    );
    // uq_rlf_surface cannot enforce uniqueness on storefront rows (NULL product_id — NULL != NULL in
    // Postgres), so this covering partial unique guarantees one live storefront pin per grant at the DB
    // level, backstopping the in-service check against concurrent double-pins.
    await q.query(
      `CREATE UNIQUE INDEX "uq_rlf_storefront" ON "reel_license_features" ("grant_id","placement") WHERE "product_id" IS NULL AND "deleted_at" IS NULL;`,
    );
    await q.query(
      `CREATE INDEX "idx_rlf_product" ON "reel_license_features" ("product_id","position") WHERE "deleted_at" IS NULL;`,
    );
    await q.query(
      `CREATE INDEX "idx_rlf_vendor" ON "reel_license_features" ("vendor_id","placement","position") WHERE "deleted_at" IS NULL;`,
    );

    await q.query(`
      CREATE TABLE "reel_license_downloads" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "grant_id" uuid NOT NULL,
        "requested_by" uuid NOT NULL,
        "url_expires_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_reel_license_downloads" PRIMARY KEY ("id"),
        CONSTRAINT "fk_rld_grant" FOREIGN KEY ("grant_id")
          REFERENCES "reel_license_grants"("id") ON DELETE CASCADE
      );`);
    await q.query(
      `CREATE INDEX "idx_rld_grant_created" ON "reel_license_downloads" ("grant_id","created_at");`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "reel_license_downloads" CASCADE;`);
    await q.query(`DROP TABLE IF EXISTS "reel_license_features" CASCADE;`);
  }
}
