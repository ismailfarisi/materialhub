import type { MigrationInterface, QueryRunner } from "typeorm";

export class HomepageLayoutSystem1712200000000 implements MigrationInterface {
  name = "HomepageLayoutSystem1712200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enums
    await queryRunner.query(
      `CREATE TYPE "layout_status" AS ENUM ('draft', 'published', 'scheduled', 'archived')`,
    );
    await queryRunner.query(
      `CREATE TYPE "bid_status" AS ENUM ('pending', 'active', 'won', 'lost', 'expired', 'cancelled')`,
    );
    await queryRunner.query(`CREATE TYPE "source_mode" AS ENUM ('manual', 'query', 'bidded')`);

    // section_types
    await queryRunner.query(`
      CREATE TABLE "section_types" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(100) NOT NULL UNIQUE,
        "label" jsonb NOT NULL,
        "description" text,
        "icon" varchar(100),
        "settings_schema" jsonb,
        "max_per_layout" smallint,
        "is_active" boolean NOT NULL DEFAULT true,
        "supports_bidding" boolean NOT NULL DEFAULT false,
        "default_settings" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    // page_layouts
    await queryRunner.query(`
      CREATE TABLE "page_layouts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "slug" varchar(255) NOT NULL,
        "title" jsonb NOT NULL,
        "status" "layout_status" NOT NULL DEFAULT 'draft',
        "published_version_id" uuid,
        "draft_version_id" uuid,
        "created_by" uuid NOT NULL REFERENCES "users"("id"),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "uq_page_layouts_slug" UNIQUE ("slug")
      )
    `);

    // layout_versions
    await queryRunner.query(`
      CREATE TABLE "layout_versions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "layout_id" uuid NOT NULL REFERENCES "page_layouts"("id") ON DELETE CASCADE,
        "version_number" integer NOT NULL,
        "publish_at" timestamptz,
        "published_at" timestamptz,
        "created_by" uuid NOT NULL REFERENCES "users"("id"),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_layout_version" UNIQUE ("layout_id", "version_number")
      )
    `);

    // Add FK constraints now that layout_versions exists
    await queryRunner.query(
      `ALTER TABLE "page_layouts" ADD CONSTRAINT "fk_published_version" FOREIGN KEY ("published_version_id") REFERENCES "layout_versions"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "page_layouts" ADD CONSTRAINT "fk_draft_version" FOREIGN KEY ("draft_version_id") REFERENCES "layout_versions"("id") ON DELETE SET NULL`,
    );

    // layout_sections
    await queryRunner.query(`
      CREATE TABLE "layout_sections" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "version_id" uuid NOT NULL REFERENCES "layout_versions"("id") ON DELETE CASCADE,
        "section_type_id" uuid NOT NULL REFERENCES "section_types"("id"),
        "position" smallint NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "visibility" jsonb NOT NULL DEFAULT '{"mobile": true, "web": true}',
        "targeting" jsonb,
        "settings" jsonb NOT NULL DEFAULT '{}',
        "source_mode" "source_mode" NOT NULL DEFAULT 'manual',
        "data_source" jsonb,
        "blocks" jsonb,
        "bid_config" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    // section_bids
    await queryRunner.query(`
      CREATE TABLE "section_bids" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "section_id" uuid NOT NULL REFERENCES "layout_sections"("id") ON DELETE CASCADE,
        "vendor_id" uuid NOT NULL REFERENCES "vendors"("id"),
        "bid_amount_fils" integer NOT NULL CHECK ("bid_amount_fils" > 0),
        "status" "bid_status" NOT NULL DEFAULT 'pending',
        "product_id" uuid REFERENCES "products"("id"),
        "content" jsonb,
        "starts_at" timestamptz NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_bid_dates" CHECK ("expires_at" > "starts_at")
      )
    `);

    // section_bid_slots
    await queryRunner.query(`
      CREATE TABLE "section_bid_slots" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "section_type_id" uuid NOT NULL REFERENCES "section_types"("id"),
        "max_slots" smallint NOT NULL CHECK ("max_slots" > 0),
        "min_bid_fils" integer NOT NULL CHECK ("min_bid_fils" > 0),
        "billing_model" varchar(20) NOT NULL DEFAULT 'per_day',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Indexes
    await queryRunner.query(
      `CREATE INDEX "idx_layout_sections_version" ON "layout_sections"("version_id", "position")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_section_bids_section" ON "section_bids"("section_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_section_bids_vendor" ON "section_bids"("vendor_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_section_bids_active" ON "section_bids"("section_id", "status", "expires_at") WHERE "status" = 'won'`,
    );

    // Seed initial section types
    await queryRunner.query(`
      INSERT INTO "section_types" ("name", "label", "icon", "supports_bidding", "default_settings") VALUES
        ('hero_carousel', '{"en":"Hero Carousel","ar":"كاروسيل رئيسي"}', 'image', false, '{"autoplay":true,"interval_ms":5000}'),
        ('category_grid', '{"en":"Category Grid","ar":"شبكة الفئات"}', 'grid-3x3', false, '{"columns":{"mobile":2,"tablet":3,"desktop":4}}'),
        ('product_carousel', '{"en":"Product Carousel","ar":"كاروسيل المنتجات"}', 'shopping-bag', true, '{"show_price":true,"show_rating":true}'),
        ('flash_deals', '{"en":"Flash Deals","ar":"عروض سريعة"}', 'zap', false, '{"show_countdown":true}'),
        ('vendor_showcase', '{"en":"Vendor Showcase","ar":"عرض البائعين"}', 'store', true, '{"layout":"horizontal_scroll"}'),
        ('brand_spotlight', '{"en":"Brand Spotlight","ar":"أضواء على العلامات"}', 'award', false, '{}'),
        ('promotional_banner', '{"en":"Promotional Banner","ar":"بانر ترويجي"}', 'megaphone', false, '{}'),
        ('editorial_post', '{"en":"Editorial Post","ar":"مقال تحريري"}', 'newspaper', false, '{}'),
        ('newsletter_signup', '{"en":"Newsletter Signup","ar":"الاشتراك بالنشرة"}', 'mail', false, '{}')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "section_bid_slots" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "section_bids" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "layout_sections" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "layout_versions" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "page_layouts" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "section_types" CASCADE`);
    await queryRunner.query(`DROP TYPE IF EXISTS "source_mode"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "bid_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "layout_status"`);
  }
}
