import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateCustomerBeautyProfiles1780400000000 implements MigrationInterface {
  name = "CreateCustomerBeautyProfiles1780400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Enum types ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "skin_type_enum" AS ENUM ('oily', 'dry', 'combination', 'normal', 'sensitive')
    `);
    await queryRunner.query(`
      CREATE TYPE "skin_concern_enum" AS ENUM ('acne', 'aging', 'dark_spots', 'dryness', 'redness', 'dullness', 'pores', 'sensitivity')
    `);
    await queryRunner.query(`
      CREATE TYPE "skin_tone_depth_enum" AS ENUM ('fair', 'light', 'medium', 'tan', 'deep')
    `);
    await queryRunner.query(`
      CREATE TYPE "undertone_enum" AS ENUM ('warm', 'cool', 'neutral')
    `);
    await queryRunner.query(`
      CREATE TYPE "hair_type_enum" AS ENUM ('straight', 'wavy', 'curly', 'coily')
    `);
    await queryRunner.query(`
      CREATE TYPE "fragrance_family_enum" AS ENUM ('floral', 'fresh', 'woody', 'oriental', 'fruity', 'gourmand')
    `);

    // ── customer_beauty_profiles ──────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "customer_beauty_profiles" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "skin_type" "skin_type_enum" NULL,
        "skin_concerns" "skin_concern_enum"[] NULL,
        "skin_tone_depth" "skin_tone_depth_enum" NULL,
        "undertone" "undertone_enum" NULL,
        "hair_type" "hair_type_enum" NULL,
        "fragrance_families" "fragrance_family_enum"[] NULL,
        "completed_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL,
        CONSTRAINT "PK_customer_beauty_profiles" PRIMARY KEY ("id"),
        CONSTRAINT "FK_customer_beauty_profiles_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // Partial unique: one active profile per user
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_customer_beauty_profiles_user"
      ON "customer_beauty_profiles" ("user_id")
      WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_customer_beauty_profiles_user"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "customer_beauty_profiles"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "fragrance_family_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "hair_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "undertone_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "skin_tone_depth_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "skin_concern_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "skin_type_enum"`);
  }
}
