import type { MigrationInterface, QueryRunner } from "typeorm";

export class ReelVendorShortlists1780800000000 implements MigrationInterface {
  name = "ReelVendorShortlists1780800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "reel_vendor_shortlists" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "vendor_id" uuid NOT NULL,
        "reel_id" uuid NOT NULL,
        "saved_by_user_id" uuid NOT NULL,
        "note" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_reel_vendor_shortlists" PRIMARY KEY ("id"),
        CONSTRAINT "fk_reel_vendor_shortlists_reel"
          FOREIGN KEY ("reel_id") REFERENCES "reels"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_reel_vendor_shortlists_vendor"
          FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_reel_vendor_shortlists_user"
          FOREIGN KEY ("saved_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_reel_vendor_shortlists_active"
        ON "reel_vendor_shortlists" ("vendor_id", "reel_id")
        WHERE "deleted_at" IS NULL;
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_reel_vendor_shortlists_vendor"
        ON "reel_vendor_shortlists" ("vendor_id")
        WHERE "deleted_at" IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "reel_vendor_shortlists" CASCADE;`);
  }
}
