import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Delivery promise (workstream 5).
 *
 * - `warehouses`: dispatch cutoff (Asia/Dubai "HH:MM"), handling days, working
 *   days (0 = Sunday … 6 = Saturday) and the destination emirates served
 *   same-day and next-day.
 * - `products.handling_days_override` for made-to-order items.
 * - `public_holidays`: the admin-edited list the estimate skips, seeded with
 *   the UAE dates published for 2026 and 2027. Islamic holidays depend on the
 *   moon sighting, so every seeded row is marked `is_estimate`; admins clear
 *   the flag once the government confirms a date.
 */
export class DeliveryPromise1793965500005 implements MigrationInterface {
  name = "DeliveryPromise1793965500005";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "warehouses"
        ADD COLUMN IF NOT EXISTS "dispatch_cutoff_time" character varying(5) NOT NULL DEFAULT '14:00',
        ADD COLUMN IF NOT EXISTS "handling_days" smallint NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS "working_days" smallint array NOT NULL DEFAULT '{1,2,3,4,5}',
        ADD COLUMN IF NOT EXISTS "same_day_emirates" character varying(50) array NOT NULL DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS "next_day_emirates" character varying(50) array NOT NULL DEFAULT '{}'`,
    );
    await queryRunner.query(
      `DO $$ BEGIN
        ALTER TABLE "warehouses" ADD CONSTRAINT "chk_warehouses_dispatch_cutoff_time"
          CHECK ("dispatch_cutoff_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
        ALTER TABLE "warehouses" ADD CONSTRAINT "chk_warehouses_handling_days"
          CHECK ("handling_days" BETWEEN 0 AND 60);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "handling_days_override" smallint`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "public_holidays" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "holiday_date" date NOT NULL,
        "name" character varying(150) NOT NULL,
        "name_ar" character varying(150),
        "country_code" character(2) NOT NULL DEFAULT 'AE',
        "is_estimate" boolean NOT NULL DEFAULT true,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_public_holidays_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_public_holidays_country_date"
        ON "public_holidays" ("country_code", "holiday_date")`,
    );

    // Seed: dates as published ahead of each year (Cabinet Resolution 27 of
    // 2024 sets which holidays exist; the Islamic dates follow the moon).
    // Left out on purpose because the published dates disagree: Hijri New
    // Year 2027, Prophet's Birthday 2027 and Commemoration Day. Admins add
    // them once announced.
    const rows: Array<[string, string, string]> = [
      ["2026-01-01", "New Year's Day", "رأس السنة الميلادية"],
      ["2026-03-20", "Eid al-Fitr", "عيد الفطر"],
      ["2026-03-21", "Eid al-Fitr", "عيد الفطر"],
      ["2026-03-22", "Eid al-Fitr", "عيد الفطر"],
      ["2026-05-26", "Arafat Day", "يوم عرفة"],
      ["2026-05-27", "Eid al-Adha", "عيد الأضحى"],
      ["2026-05-28", "Eid al-Adha", "عيد الأضحى"],
      ["2026-05-29", "Eid al-Adha", "عيد الأضحى"],
      ["2026-06-16", "Hijri New Year", "رأس السنة الهجرية"],
      ["2026-08-25", "Prophet's Birthday", "المولد النبوي"],
      ["2026-12-02", "National Day", "عيد الاتحاد"],
      ["2026-12-03", "National Day", "عيد الاتحاد"],
      ["2027-01-01", "New Year's Day", "رأس السنة الميلادية"],
      ["2027-03-09", "Eid al-Fitr", "عيد الفطر"],
      ["2027-03-10", "Eid al-Fitr", "عيد الفطر"],
      ["2027-03-11", "Eid al-Fitr", "عيد الفطر"],
      ["2027-05-15", "Arafat Day", "يوم عرفة"],
      ["2027-05-16", "Eid al-Adha", "عيد الأضحى"],
      ["2027-05-17", "Eid al-Adha", "عيد الأضحى"],
      ["2027-05-18", "Eid al-Adha", "عيد الأضحى"],
      ["2027-12-02", "National Day", "عيد الاتحاد"],
      ["2027-12-03", "National Day", "عيد الاتحاد"],
    ];
    for (const [date, name, nameAr] of rows) {
      await queryRunner.query(
        `INSERT INTO "public_holidays" ("holiday_date", "name", "name_ar", "country_code", "is_estimate")
         VALUES ($1, $2, $3, 'AE', true)
         ON CONFLICT ("country_code", "holiday_date") DO NOTHING`,
        [date, name, nameAr],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "public_holidays"`);
    await queryRunner.query(
      `ALTER TABLE "products" DROP COLUMN IF EXISTS "handling_days_override"`,
    );
    await queryRunner.query(
      `ALTER TABLE "warehouses"
        DROP CONSTRAINT IF EXISTS "chk_warehouses_handling_days",
        DROP CONSTRAINT IF EXISTS "chk_warehouses_dispatch_cutoff_time",
        DROP COLUMN IF EXISTS "next_day_emirates",
        DROP COLUMN IF EXISTS "same_day_emirates",
        DROP COLUMN IF EXISTS "working_days",
        DROP COLUMN IF EXISTS "handling_days",
        DROP COLUMN IF EXISTS "dispatch_cutoff_time"`,
    );
  }
}
