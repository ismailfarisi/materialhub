import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateUserVerifiedPhones1782600000000 implements MigrationInterface {
  name = "CreateUserVerifiedPhones1782600000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "user_verified_phones" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "phone" varchar(20) NOT NULL,
        "verified_at" timestamptz NOT NULL DEFAULT now(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_user_verified_phones" PRIMARY KEY ("id"),
        CONSTRAINT "fk_user_verified_phone_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      );`);

    // One live row per (user, number); re-verifying the same number is a no-op.
    await q.query(
      `CREATE UNIQUE INDEX "uq_user_verified_phone" ON "user_verified_phones" ("user_id","phone")
         WHERE "deleted_at" IS NULL;`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "uq_user_verified_phone";`);
    await q.query(`DROP TABLE IF EXISTS "user_verified_phones";`);
  }
}
