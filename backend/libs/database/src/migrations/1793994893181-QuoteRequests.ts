import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Request for quotation (RFQ, roadmap item 3; workstream `feature/rfq`).
 *
 * - `quote_requests`: the buyer's request (spec, quantity, unit, need-by date,
 *   delivery emirate, attachments under `private/quotes/`).
 * - `quote_request_vendors`: one row per targeted supplier (max three, enforced
 *   in order-service), carrying that supplier's status.
 * - `quote_responses`: priced responses in fils; a revision supersedes the
 *   previous row instead of overwriting it.
 * - `quote_messages`: the thread per request-supplier pair.
 * - `quote_status_history`: append-only status log.
 * - `cart_items.quote_id` / `quoted_unit_price`: a cart line added by accepting
 *   a quote. Price resolution order is quote > tier > base.
 * - Four notification types for the in-app/email/push pipeline.
 *
 * Statuses and units are varchar + CHECK, not Postgres enums, so new states
 * don't need ALTER TYPE. `down` cannot remove enum values from
 * notifications_type_enum / notification_preferences_notification_type_enum;
 * they stay, unused.
 */
export class QuoteRequests1793994893181 implements MigrationInterface {
  name = "QuoteRequests1793994893181";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "quote_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "request_number" character varying(30) NOT NULL, "buyer_id" uuid NOT NULL, "product_id" uuid, "variant_id" uuid, "category_id" uuid, "title" character varying(200) NOT NULL, "specification" text NOT NULL, "quantity" integer NOT NULL, "unit" character varying(16) NOT NULL, "need_by" date, "delivery_emirate" character varying(32) NOT NULL, "attachments" jsonb NOT NULL DEFAULT '[]', "status" character varying(16) NOT NULL DEFAULT 'open', "accepted_response_id" uuid, "accepted_at" TIMESTAMP WITH TIME ZONE, "cancelled_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_93827bdeecd534105b196d7c758" UNIQUE ("request_number"), CONSTRAINT "PK_c05f72de8be0ec6b0985a851558" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6953a7dd1714a12860dcceb4f4" ON "quote_requests" ("buyer_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE TABLE "quote_request_vendors" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "quote_request_id" uuid NOT NULL, "vendor_id" uuid NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'pending', "current_response_id" uuid, "decline_reason" text, "last_message_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_718a2b015958fad151edff1b1f0" UNIQUE ("quote_request_id", "vendor_id"), CONSTRAINT "PK_54b71b71b440fe7d06d0431d3fb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7a7a36dc4dee2869341ae805af" ON "quote_request_vendors" ("vendor_id", "status")`,
    );
    await queryRunner.query(
      `CREATE TABLE "quote_responses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "quote_request_vendor_id" uuid NOT NULL, "quote_request_id" uuid NOT NULL, "vendor_id" uuid NOT NULL, "product_id" uuid NOT NULL, "variant_id" uuid, "unit_price" integer NOT NULL, "currency" character varying(3) NOT NULL DEFAULT 'AED', "moq" integer NOT NULL, "lead_time_days" integer NOT NULL, "valid_until" date NOT NULL, "notes" text, "status" character varying(16) NOT NULL DEFAULT 'submitted', "responded_by" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_95d89bd0804de5e4e2d66c2d1b2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f62fe99762674840df4f694e11" ON "quote_responses" ("quote_request_vendor_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE TABLE "quote_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "quote_request_vendor_id" uuid NOT NULL, "quote_request_id" uuid NOT NULL, "sender_id" uuid, "sender_role" character varying(10) NOT NULL, "body" text NOT NULL, "attachments" jsonb NOT NULL DEFAULT '[]', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_fbeb7eece51ecb0a6a96b3fd049" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_eb12616d6681dd1c84757872d3" ON "quote_messages" ("quote_request_vendor_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE TABLE "quote_status_history" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "quote_request_id" uuid NOT NULL, "quote_request_vendor_id" uuid, "subject" character varying(10) NOT NULL, "from_status" character varying(20), "to_status" character varying(20) NOT NULL, "actor_role" character varying(10) NOT NULL, "actor_id" uuid, "note" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_e96e7899141015ac17bd1a50d0f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_83995c646fc327f59667f58934" ON "quote_status_history" ("quote_request_id", "created_at")`,
    );
    await queryRunner.query(`ALTER TABLE "cart_items" ADD "quote_id" uuid`);
    await queryRunner.query(`ALTER TABLE "cart_items" ADD "quoted_unit_price" integer`);
    await queryRunner.query(
      `ALTER TABLE "cart_items" ADD CONSTRAINT "FK_c285cb027c4978c3e642803ca97" FOREIGN KEY ("quote_id") REFERENCES "quote_responses"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_requests" ADD CONSTRAINT "FK_c8578d9d86282a6a550c0a5d3d7" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_requests" ADD CONSTRAINT "FK_ed10d3b64e1522abcd988853fb7" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_requests" ADD CONSTRAINT "FK_f7bb64a3e4b903589a8ee9031ee" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_requests" ADD CONSTRAINT "FK_527f5a01f1809beb5680fd8d564" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_request_vendors" ADD CONSTRAINT "FK_80fc5b69aeef07c001eb7e10832" FOREIGN KEY ("quote_request_id") REFERENCES "quote_requests"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_request_vendors" ADD CONSTRAINT "FK_31ac5776d9a3278866d5ea6575a" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_responses" ADD CONSTRAINT "FK_347c6ed609c4a27e2df36224cd5" FOREIGN KEY ("quote_request_vendor_id") REFERENCES "quote_request_vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_responses" ADD CONSTRAINT "FK_68c90ae7ad9f7acbe9be44fb3cf" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_responses" ADD CONSTRAINT "FK_a8327720a7a24741d3880695eaa" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_responses" ADD CONSTRAINT "FK_00073201c149047ce6fac829140" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_messages" ADD CONSTRAINT "FK_1ed618bb37701c131f200df03f2" FOREIGN KEY ("quote_request_vendor_id") REFERENCES "quote_request_vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_status_history" ADD CONSTRAINT "FK_1c34b2004696e623be8ea8d0aa3" FOREIGN KEY ("quote_request_id") REFERENCES "quote_requests"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // ── Integrity rules TypeORM can't express ─────────────────────────
    await queryRunner.query(
      `ALTER TABLE "quote_requests" ADD CONSTRAINT "CHK_quote_requests_status" CHECK ("status" IN ('open', 'quoted', 'accepted', 'cancelled', 'closed'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_requests" ADD CONSTRAINT "CHK_quote_requests_unit" CHECK ("unit" IN ('sheet', 'roll', 'metre', 'pack', 'carton', 'piece', 'kg'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_requests" ADD CONSTRAINT "CHK_quote_requests_quantity" CHECK ("quantity" > 0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_request_vendors" ADD CONSTRAINT "CHK_quote_request_vendors_status" CHECK ("status" IN ('pending', 'responded', 'vendor_declined', 'buyer_declined', 'accepted', 'not_selected', 'cancelled'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_responses" ADD CONSTRAINT "CHK_quote_responses_status" CHECK ("status" IN ('submitted', 'superseded', 'accepted', 'declined'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_responses" ADD CONSTRAINT "CHK_quote_responses_amounts" CHECK ("unit_price" > 0 AND "moq" > 0 AND "lead_time_days" >= 0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_messages" ADD CONSTRAINT "CHK_quote_messages_sender_role" CHECK ("sender_role" IN ('buyer', 'vendor', 'system'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_items" ADD CONSTRAINT "CHK_cart_items_quote_price" CHECK (("quote_id" IS NULL) = ("quoted_unit_price" IS NULL))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cart_items_quote_id" ON "cart_items" ("quote_id") WHERE "quote_id" IS NOT NULL`,
    );

    // Race-free request numbers (RFQ-<year>-<seq>); TypeORM doesn't manage
    // standalone sequences, so this lives only here.
    await queryRunner.query(`CREATE SEQUENCE IF NOT EXISTS "quote_request_number_seq"`);

    // ── Notification types ────────────────────────────────────────────
    for (const type of [
      "quote_request_received",
      "quote_response_received",
      "quote_message_received",
      "quote_accepted",
    ]) {
      await queryRunner.query(
        `ALTER TYPE "public"."notifications_type_enum" ADD VALUE IF NOT EXISTS '${type}'`,
      );
      await queryRunner.query(
        `ALTER TYPE "public"."notification_preferences_notification_type_enum" ADD VALUE IF NOT EXISTS '${type}'`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SEQUENCE IF EXISTS "quote_request_number_seq"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_cart_items_quote_id"`);
    await queryRunner.query(
      `ALTER TABLE "cart_items" DROP CONSTRAINT IF EXISTS "CHK_cart_items_quote_price"`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_status_history" DROP CONSTRAINT "FK_1c34b2004696e623be8ea8d0aa3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_messages" DROP CONSTRAINT "FK_1ed618bb37701c131f200df03f2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_responses" DROP CONSTRAINT "FK_00073201c149047ce6fac829140"`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_responses" DROP CONSTRAINT "FK_a8327720a7a24741d3880695eaa"`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_responses" DROP CONSTRAINT "FK_68c90ae7ad9f7acbe9be44fb3cf"`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_responses" DROP CONSTRAINT "FK_347c6ed609c4a27e2df36224cd5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_request_vendors" DROP CONSTRAINT "FK_31ac5776d9a3278866d5ea6575a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_request_vendors" DROP CONSTRAINT "FK_80fc5b69aeef07c001eb7e10832"`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_requests" DROP CONSTRAINT "FK_527f5a01f1809beb5680fd8d564"`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_requests" DROP CONSTRAINT "FK_f7bb64a3e4b903589a8ee9031ee"`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_requests" DROP CONSTRAINT "FK_ed10d3b64e1522abcd988853fb7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_requests" DROP CONSTRAINT "FK_c8578d9d86282a6a550c0a5d3d7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_items" DROP CONSTRAINT "FK_c285cb027c4978c3e642803ca97"`,
    );
    await queryRunner.query(`ALTER TABLE "cart_items" DROP COLUMN "quoted_unit_price"`);
    await queryRunner.query(`ALTER TABLE "cart_items" DROP COLUMN "quote_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_83995c646fc327f59667f58934"`);
    await queryRunner.query(`DROP TABLE "quote_status_history"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_eb12616d6681dd1c84757872d3"`);
    await queryRunner.query(`DROP TABLE "quote_messages"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_f62fe99762674840df4f694e11"`);
    await queryRunner.query(`DROP TABLE "quote_responses"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_7a7a36dc4dee2869341ae805af"`);
    await queryRunner.query(`DROP TABLE "quote_request_vendors"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_6953a7dd1714a12860dcceb4f4"`);
    await queryRunner.query(`DROP TABLE "quote_requests"`);
  }
}
