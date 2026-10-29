import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Aligns user_two_factor with the entity after the 2FA-encryption work shipped
 * the entity change without a paired migration.
 *
 * Idempotent: the rename branches no-op on environments where the columns are
 * already named *_encrypted (e.g. production, where the fix was applied
 * directly), so this migration is safe to run anywhere.
 */
export class FixUserTwoFactorEncryptedColumns1779700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // secret -> secret_encrypted (varchar(255) NOT NULL -> text NOT NULL)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'user_two_factor' AND column_name = 'secret'
        ) THEN
          ALTER TABLE "user_two_factor" RENAME COLUMN "secret" TO "secret_encrypted";
          ALTER TABLE "user_two_factor" ALTER COLUMN "secret_encrypted" TYPE text;
        END IF;
      END $$;
    `);

    // backup_codes (jsonb NULL) -> backup_codes_encrypted (text NOT NULL DEFAULT '[]')
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'user_two_factor' AND column_name = 'backup_codes'
        ) THEN
          ALTER TABLE "user_two_factor" RENAME COLUMN "backup_codes" TO "backup_codes_encrypted";
          UPDATE "user_two_factor" SET "backup_codes_encrypted" = '[]'::jsonb
            WHERE "backup_codes_encrypted" IS NULL;
          ALTER TABLE "user_two_factor"
            ALTER COLUMN "backup_codes_encrypted" TYPE text USING "backup_codes_encrypted"::text;
          ALTER TABLE "user_two_factor"
            ALTER COLUMN "backup_codes_encrypted" SET DEFAULT '[]';
          ALTER TABLE "user_two_factor"
            ALTER COLUMN "backup_codes_encrypted" SET NOT NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "user_two_factor" ADD COLUMN IF NOT EXISTS "enabled_at" timestamptz NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "user_two_factor" ADD COLUMN IF NOT EXISTS "last_used_at" timestamptz NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user_two_factor" DROP COLUMN IF EXISTS "last_used_at"`);
    await queryRunner.query(`ALTER TABLE "user_two_factor" DROP COLUMN IF EXISTS "enabled_at"`);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'user_two_factor' AND column_name = 'backup_codes_encrypted'
        ) THEN
          ALTER TABLE "user_two_factor" ALTER COLUMN "backup_codes_encrypted" DROP NOT NULL;
          ALTER TABLE "user_two_factor" ALTER COLUMN "backup_codes_encrypted" DROP DEFAULT;
          ALTER TABLE "user_two_factor"
            ALTER COLUMN "backup_codes_encrypted" TYPE jsonb USING "backup_codes_encrypted"::jsonb;
          ALTER TABLE "user_two_factor" RENAME COLUMN "backup_codes_encrypted" TO "backup_codes";
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'user_two_factor' AND column_name = 'secret_encrypted'
        ) THEN
          ALTER TABLE "user_two_factor" ALTER COLUMN "secret_encrypted" TYPE varchar(255);
          ALTER TABLE "user_two_factor" RENAME COLUMN "secret_encrypted" TO "secret";
        END IF;
      END $$;
    `);
  }
}
