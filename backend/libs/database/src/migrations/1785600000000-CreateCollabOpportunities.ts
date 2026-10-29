import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Vendor collaboration opportunities (spec §7): product seeding, paid campaigns,
 * and event appearances, distributed either to the open creator board or as a
 * direct invite.
 *
 * Enum-typed columns are stored as `varchar`, not Postgres enum types. That is
 * the unanimous convention across this neighbourhood (reel_briefs,
 * reel_brief_bids, reel_license_offers, reel_license_grants, reel_brief_events,
 * creator_applications all do the same), and it keeps the door open for new
 * collab types — `ALTER TYPE ... ADD VALUE` cannot run inside a transaction,
 * which makes growing a real enum a migration footgun. The TypeScript enums in
 * `enums/collab.enums.ts` remain the source of truth for valid values.
 *
 * The two CHECK constraints below are the ones code cannot reliably enforce on
 * its own, so they are worth the DB round trip.
 */
export class CreateCollabOpportunities1785600000000 implements MigrationInterface {
  name = "CreateCollabOpportunities1785600000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "collab_opportunities" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "vendor_id" uuid NOT NULL,
        "type" varchar(20) NOT NULL,
        "visibility" varchar(10) NOT NULL,
        "status" varchar(12) NOT NULL DEFAULT 'draft',
        "title" varchar(200) NOT NULL,
        "description" text NOT NULL,
        "deliverables" jsonb,
        "slots_total" integer NOT NULL DEFAULT 1,
        "slots_filled" integer NOT NULL DEFAULT 0,
        "applications_close_at" timestamptz,
        "deliver_by" timestamptz,
        "min_follower_count" integer,
        "required_platforms" varchar(20)[],
        "required_categories" varchar(100)[],
        "rights_scope" varchar(20),
        "fee_fils" bigint,
        "funding_source" varchar(20),
        "seeded_product_id" uuid,
        "seeded_variant_id" uuid,
        "seeded_qty" integer,
        "seeding_value_fils" bigint,
        "location_id" uuid,
        "starts_at" timestamptz,
        "ends_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_collab_opportunities" PRIMARY KEY ("id"),
        CONSTRAINT "fk_collab_opp_vendor" FOREIGN KEY ("vendor_id")
          REFERENCES "vendors"("id") ON DELETE CASCADE
      );`);

    // Each type carries its own required fields. This applies to drafts too: a
    // draft that could never become a valid opportunity is not worth storing.
    // Written as an OR-of-ANDs rather than a CASE so that an unrecognised `type`
    // fails closed — a CASE with no ELSE yields NULL, which a CHECK accepts.
    await q.query(`
      ALTER TABLE "collab_opportunities" ADD CONSTRAINT "ck_collab_type_fields" CHECK (
        ("type" = 'product_seeding'
          AND "seeded_product_id" IS NOT NULL
          AND "seeded_qty" IS NOT NULL AND "seeded_qty" > 0)
        OR ("type" = 'paid_campaign'
          AND "fee_fils" IS NOT NULL AND "fee_fils" > 0
          AND "funding_source" IS NOT NULL)
        OR ("type" = 'event_appearance'
          AND "location_id" IS NOT NULL
          AND "starts_at" IS NOT NULL
          AND "ends_at" IS NOT NULL
          AND "ends_at" > "starts_at")
      );`);

    await q.query(`
      ALTER TABLE "collab_opportunities" ADD CONSTRAINT "ck_collab_slots" CHECK (
        "slots_total" > 0 AND "slots_filled" >= 0 AND "slots_filled" <= "slots_total"
      );`);

    // Board listing: open + board, ordered by closing date.
    await q.query(
      `CREATE INDEX "idx_collab_board" ON "collab_opportunities" ("status","visibility","applications_close_at")
         WHERE "deleted_at" IS NULL;`,
    );
    // Vendor's own pipeline view.
    await q.query(
      `CREATE INDEX "idx_collab_vendor" ON "collab_opportunities" ("vendor_id","status")
         WHERE "deleted_at" IS NULL;`,
    );

    await q.query(`
      CREATE TABLE "collab_applications" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "opportunity_id" uuid NOT NULL,
        "creator_id" uuid NOT NULL,
        "status" varchar(20) NOT NULL,
        "pitch" text,
        "proposed_fee_fils" bigint,
        "agreed_fee_fils" bigint,
        "delivered_reel_id" uuid,
        "shipment_id" uuid,
        "shipping_address_id" uuid,
        "revision_count" integer NOT NULL DEFAULT 0,
        "responded_at" timestamptz,
        "accepted_at" timestamptz,
        "delivered_at" timestamptz,
        "completed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_collab_applications" PRIMARY KEY ("id"),
        CONSTRAINT "fk_collab_app_opportunity" FOREIGN KEY ("opportunity_id")
          REFERENCES "collab_opportunities"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_collab_app_creator" FOREIGN KEY ("creator_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      );`);

    // One application per creator per opportunity, respecting soft delete.
    await q.query(
      `CREATE UNIQUE INDEX "uq_collab_app_creator" ON "collab_applications" ("opportunity_id","creator_id")
         WHERE "deleted_at" IS NULL;`,
    );
    // The creator's own "my collabs" list.
    await q.query(
      `CREATE INDEX "idx_collab_app_creator" ON "collab_applications" ("creator_id","status")
         WHERE "deleted_at" IS NULL;`,
    );

    await q.query(`
      CREATE TABLE "collab_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "opportunity_id" uuid NOT NULL,
        "application_id" uuid,
        "actor" varchar(10) NOT NULL,
        "actor_user_id" uuid,
        "event_type" varchar(24) NOT NULL,
        "amount_fils_snapshot" bigint,
        "note" text,
        "metadata" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_collab_events" PRIMARY KEY ("id"),
        CONSTRAINT "fk_collab_event_opportunity" FOREIGN KEY ("opportunity_id")
          REFERENCES "collab_opportunities"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_collab_event_application" FOREIGN KEY ("application_id")
          REFERENCES "collab_applications"("id") ON DELETE CASCADE
      );`);

    await q.query(
      `CREATE INDEX "idx_collab_events_opp" ON "collab_events" ("opportunity_id","created_at");`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "collab_events" CASCADE;`);
    await q.query(`DROP TABLE IF EXISTS "collab_applications" CASCADE;`);
    await q.query(`DROP TABLE IF EXISTS "collab_opportunities" CASCADE;`);
  }
}
