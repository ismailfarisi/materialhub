import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreatePhoneAuthChallenges1781900000000 implements MigrationInterface {
  name = "CreatePhoneAuthChallenges1781900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "phone_auth_challenges" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "phone" varchar(20) NOT NULL,
        "token_hash" varchar(255) NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "used_at" timestamptz,
        "ip_address" varchar(45),
        "user_agent" varchar(512),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_phone_auth_challenges" PRIMARY KEY ("id"),
        CONSTRAINT "uq_phone_auth_challenges_token_hash" UNIQUE ("token_hash")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_phone_auth_challenges_phone" ON "phone_auth_challenges" ("phone")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_phone_auth_challenges_token_hash_active" ON "phone_auth_challenges" ("token_hash") WHERE "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_phone_auth_challenges_token_hash_active"`);
    await queryRunner.query(`DROP INDEX "idx_phone_auth_challenges_phone"`);
    await queryRunner.query(`DROP TABLE "phone_auth_challenges"`);
  }
}
