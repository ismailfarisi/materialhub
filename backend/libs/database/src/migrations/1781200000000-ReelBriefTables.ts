import type { MigrationInterface, QueryRunner } from "typeorm";

export class ReelBriefTables1781200000000 implements MigrationInterface {
  name = "ReelBriefTables1781200000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "reel_briefs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "vendor_id" uuid NOT NULL,
        "title" varchar(200) NOT NULL,
        "brief" text NOT NULL,
        "rights_scope" varchar(20) NOT NULL,
        "budget_guide_fils" bigint,
        "target_product_id" uuid,
        "target_category" varchar(100),
        "bids_close_at" timestamptz NOT NULL,
        "status" varchar(12) NOT NULL DEFAULT 'open',
        "awarded_bid_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_reel_briefs" PRIMARY KEY ("id")
      );`);
    await q.query(
      `CREATE INDEX "idx_brief_status_open" ON "reel_briefs" ("status","bids_close_at") WHERE "deleted_at" IS NULL;`,
    );
    await q.query(
      `CREATE INDEX "idx_brief_vendor" ON "reel_briefs" ("vendor_id") WHERE "deleted_at" IS NULL;`,
    );

    await q.query(`
      CREATE TABLE "reel_brief_bids" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "brief_id" uuid NOT NULL,
        "creator_id" uuid NOT NULL,
        "amount_fils" bigint NOT NULL,
        "pitch" text NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'pending',
        "delivered_reel_id" uuid,
        "grant_id" uuid,
        "delivery_deadline_at" timestamptz,
        "delivery_round" int NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_reel_brief_bids" PRIMARY KEY ("id"),
        CONSTRAINT "fk_rbb_brief" FOREIGN KEY ("brief_id")
          REFERENCES "reel_briefs"("id") ON DELETE CASCADE
      );`);
    await q.query(`CREATE INDEX "idx_bid_brief" ON "reel_brief_bids" ("brief_id","status");`);
    await q.query(`CREATE INDEX "idx_bid_creator" ON "reel_brief_bids" ("creator_id");`);
    // At most one in-flight winner per brief (accepted/delivered/revision_requested).
    await q.query(
      `CREATE UNIQUE INDEX "uq_bid_awarded" ON "reel_brief_bids" ("brief_id") WHERE "status" IN ('accepted','delivered','revision_requested');`,
    );

    await q.query(`
      CREATE TABLE "reel_brief_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "brief_id" uuid NOT NULL,
        "bid_id" uuid,
        "actor" varchar(10) NOT NULL,
        "event_type" varchar(24) NOT NULL,
        "amount_fils_snapshot" bigint,
        "note" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_reel_brief_events" PRIMARY KEY ("id"),
        CONSTRAINT "fk_rbe_brief" FOREIGN KEY ("brief_id")
          REFERENCES "reel_briefs"("id") ON DELETE CASCADE
      );`);
    await q.query(
      `CREATE INDEX "idx_brief_event_brief_created" ON "reel_brief_events" ("brief_id","created_at");`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "reel_brief_events" CASCADE;`);
    await q.query(`DROP TABLE IF EXISTS "reel_brief_bids" CASCADE;`);
    await q.query(`DROP TABLE IF EXISTS "reel_briefs" CASCADE;`);
  }
}
