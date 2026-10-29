import type { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1711500000000 implements MigrationInterface {
  name = "InitialSchema1711500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Extensions ──────────────────────────────────────────────────
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pg_trgm"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "unaccent"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // ── Enum types ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "user_role" AS ENUM ('super_admin','admin','vendor','customer','guest')
    `);
    await queryRunner.query(`
      CREATE TYPE "user_status" AS ENUM ('active','inactive','suspended','pending_verification')
    `);
    await queryRunner.query(`
      CREATE TYPE "address_type" AS ENUM ('shipping','billing','both')
    `);
    await queryRunner.query(`
      CREATE TYPE "token_type" AS ENUM ('email_verify','password_reset','two_fa_setup','magic_link')
    `);
    await queryRunner.query(`
      CREATE TYPE "notification_type" AS ENUM ('order_update','payment','promotion','system','vendor','order_confirmed','order_shipped','order_delivered','payment_received','payout_sent','new_review','low_stock','vendor_approved','return_requested','dispute_opened','dispute_resolved')
    `);
    await queryRunner.query(`
      CREATE TYPE "notification_channel" AS ENUM ('email','push','sms','in_app')
    `);
    await queryRunner.query(`
      CREATE TYPE "vendor_status" AS ENUM ('pending','under_review','approved','rejected','suspended','deactivated')
    `);
    await queryRunner.query(`
      CREATE TYPE "vendor_document_type" AS ENUM ('trade_license','vat_certificate','emirates_id','passport','bank_statement','other')
    `);
    await queryRunner.query(`
      CREATE TYPE "commission_type" AS ENUM ('percentage','fixed','tiered')
    `);
    await queryRunner.query(`
      CREATE TYPE "commission_status" AS ENUM ('pending','approved','paid','disputed','cancelled')
    `);
    await queryRunner.query(`
      CREATE TYPE "payout_status" AS ENUM ('pending','processing','paid','failed')
    `);
    await queryRunner.query(`
      CREATE TYPE "product_status" AS ENUM ('draft','pending_review','approved','rejected','published','unpublished','archived')
    `);
    await queryRunner.query(`
      CREATE TYPE "attribute_type" AS ENUM ('text','number','boolean','select','multi_select','color','date')
    `);
    await queryRunner.query(`
      CREATE TYPE "relation_type" AS ENUM ('related','cross_sell','upsell','frequently_bought_together')
    `);
    await queryRunner.query(`
      CREATE TYPE "reservation_status" AS ENUM ('active','committed','released','expired')
    `);
    await queryRunner.query(`
      CREATE TYPE "review_status" AS ENUM ('pending','approved','rejected','flagged')
    `);
    await queryRunner.query(`
      CREATE TYPE "order_status" AS ENUM ('draft','pending_payment','payment_failed','confirmed','processing','ready_to_ship','shipped','out_for_delivery','delivered','partially_shipped','partially_delivered','cancelled','refund_requested','refunded','partially_refunded','disputed')
    `);
    await queryRunner.query(`
      CREATE TYPE "shipment_status" AS ENUM ('pending','picked_up','in_transit','out_for_delivery','delivered','failed_delivery','returned')
    `);
    await queryRunner.query(`
      CREATE TYPE "return_status" AS ENUM ('requested','approved','rejected','shipped_back','received','refunded','closed')
    `);
    await queryRunner.query(`
      CREATE TYPE "return_reason" AS ENUM ('defective','wrong_item','not_as_described','changed_mind','arrived_late','other')
    `);
    await queryRunner.query(`
      CREATE TYPE "dispute_status" AS ENUM ('opened','under_review','escalated','resolved_buyer','resolved_seller','closed')
    `);
    await queryRunner.query(`
      CREATE TYPE "payment_status" AS ENUM ('pending','authorized','captured','failed','refunded','partially_refunded','chargeback','cancelled')
    `);
    await queryRunner.query(`
      CREATE TYPE "payment_method" AS ENUM ('credit_card','debit_card','paypal','stripe','bank_transfer','cash_on_delivery','wallet','crypto','tabby','tamara')
    `);
    await queryRunner.query(`
      CREATE TYPE "gift_card_status" AS ENUM ('active','redeemed','expired','disabled')
    `);
    await queryRunner.query(`
      CREATE TYPE "webhook_status" AS ENUM ('pending','processed','failed','skipped')
    `);
    await queryRunner.query(`
      CREATE TYPE "coupon_type" AS ENUM ('percentage','fixed_amount','free_shipping','buy_x_get_y')
    `);
    await queryRunner.query(`
      CREATE TYPE "coupon_applicable_to" AS ENUM ('all','specific_products','specific_categories','specific_vendors')
    `);
    await queryRunner.query(`
      CREATE TYPE "ticket_status" AS ENUM ('open','in_progress','waiting_customer','resolved','closed')
    `);
    await queryRunner.query(`
      CREATE TYPE "ticket_priority" AS ENUM ('low','medium','high','urgent')
    `);
    await queryRunner.query(`
      CREATE TYPE "page_status" AS ENUM ('draft','published','archived')
    `);

    // ── Users & Auth ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "first_name" varchar(100) NOT NULL,
        "last_name" varchar(100) NOT NULL,
        "email" varchar(255) NOT NULL,
        "phone" varchar(20),
        "phone_verified_at" timestamptz,
        "email_verified_at" timestamptz,
        "password_hash" varchar(255) NOT NULL,
        "role" "user_role" NOT NULL DEFAULT 'customer',
        "status" "user_status" NOT NULL DEFAULT 'pending_verification',
        "avatar_url" varchar(1024),
        "preferred_locale" varchar(10) NOT NULL DEFAULT 'en',
        "preferred_currency" varchar(3) NOT NULL DEFAULT 'AED',
        "fcm_token" varchar(512),
        "last_login_at" timestamptz,
        "login_attempts" smallint NOT NULL DEFAULT 0,
        "locked_until" timestamptz,
        "google_id" varchar(255),
        "apple_id" varchar(255),
        "wallet_balance" integer NOT NULL DEFAULT 0,
        "wallet_currency" varchar(3) NOT NULL DEFAULT 'AED',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_users" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_users_email_active" ON "users" ("email") WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "user_addresses" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "user_id" uuid NOT NULL,
        "label" varchar(100) NOT NULL,
        "type" "address_type" NOT NULL,
        "first_name" varchar(100) NOT NULL,
        "last_name" varchar(100) NOT NULL,
        "phone" varchar(20) NOT NULL,
        "address_line_1" varchar(255) NOT NULL,
        "address_line_2" varchar(255),
        "city" varchar(100) NOT NULL,
        "state" varchar(100),
        "postal_code" varchar(20),
        "country_code" char(2) NOT NULL,
        "latitude" numeric(10,7),
        "longitude" numeric(10,7),
        "area_id" uuid,
        "is_default" boolean NOT NULL DEFAULT false,
        "delivery_notes" varchar(500),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_user_addresses" PRIMARY KEY ("id"),
        CONSTRAINT "fk_user_addresses_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "user_sessions" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "user_id" uuid NOT NULL,
        "refresh_token_hash" varchar(255) NOT NULL,
        "device_info" jsonb,
        "ip_address" varchar(45),
        "expires_at" timestamptz NOT NULL,
        "is_revoked" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_user_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "fk_user_sessions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "user_tokens" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "user_id" uuid NOT NULL,
        "type" "token_type" NOT NULL,
        "token_hash" varchar(255) NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "used_at" timestamptz,
        "ip_address" varchar(45),
        "user_agent" varchar(512),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_user_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "fk_user_tokens_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "user_two_factor" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "user_id" uuid NOT NULL UNIQUE,
        "secret" varchar(255) NOT NULL,
        "is_enabled" boolean NOT NULL DEFAULT false,
        "backup_codes" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_user_two_factor" PRIMARY KEY ("id"),
        CONSTRAINT "fk_user_two_factor_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "guest_sessions" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "session_token" varchar(255) NOT NULL UNIQUE,
        "fingerprint_hash" varchar(255),
        "ip_address" varchar(45),
        "user_agent" varchar(512),
        "preferred_locale" varchar(10) NOT NULL DEFAULT 'en',
        "preferred_currency" varchar(3) NOT NULL DEFAULT 'AED',
        "merged_to_user_id" uuid,
        "merged_at" timestamptz,
        "last_active_at" timestamptz NOT NULL DEFAULT now(),
        "expires_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_guest_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "fk_guest_sessions_merged_user" FOREIGN KEY ("merged_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "user_id" uuid NOT NULL,
        "type" "notification_type" NOT NULL,
        "channel" "notification_channel" NOT NULL DEFAULT 'in_app',
        "title" varchar(255) NOT NULL,
        "body" text NOT NULL,
        "data" jsonb,
        "action_url" varchar(1024),
        "is_read" boolean NOT NULL DEFAULT false,
        "read_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_notifications" PRIMARY KEY ("id"),
        CONSTRAINT "fk_notifications_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "notification_preferences" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "user_id" uuid NOT NULL,
        "notification_type" "notification_type" NOT NULL,
        "channel" "notification_channel" NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_notification_preferences" PRIMARY KEY ("id"),
        CONSTRAINT "fk_notification_preferences_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_notification_preferences_user_type_channel" UNIQUE ("user_id", "notification_type", "channel")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "saved_searches" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "user_id" uuid NOT NULL,
        "name" varchar(255),
        "query" varchar(500) NOT NULL,
        "filters" jsonb,
        "notify_on_match" boolean NOT NULL DEFAULT false,
        "last_notified_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_saved_searches" PRIMARY KEY ("id"),
        CONSTRAINT "fk_saved_searches_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // ── Vendors ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "vendors" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "user_id" uuid NOT NULL,
        "name" varchar(255) NOT NULL,
        "slug" varchar(255) NOT NULL,
        "description" text,
        "logo_url" varchar(1024),
        "banner_url" varchar(1024),
        "cover_images" jsonb NOT NULL DEFAULT '[]',
        "status" "vendor_status" NOT NULL DEFAULT 'pending',
        "verified_at" timestamptz,
        "verified_by" uuid,
        "rejection_reason" text,
        "business_name" varchar(255) NOT NULL,
        "business_type" varchar(100) NOT NULL,
        "trade_license_number" varchar(100),
        "vat_number" varchar(50),
        "vat_registered" boolean NOT NULL DEFAULT false,
        "contact_email" varchar(255) NOT NULL,
        "contact_phone" varchar(20) NOT NULL,
        "whatsapp" varchar(20),
        "website_url" varchar(512),
        "address" jsonb,
        "social_links" jsonb NOT NULL DEFAULT '{}',
        "commission_type" "commission_type",
        "commission_value" numeric(8,4),
        "commission_tiers" jsonb,
        "payout_schedule" varchar(50) NOT NULL DEFAULT 'biweekly',
        "minimum_payout" integer NOT NULL DEFAULT 10000,
        "auto_approve_orders" boolean NOT NULL DEFAULT true,
        "auto_create_shipment" boolean NOT NULL DEFAULT false,
        "default_carrier" varchar(100),
        "processing_time_days" smallint NOT NULL DEFAULT 2,
        "return_policy" text,
        "shipping_policy" text,
        "rating_avg" numeric(3,2) NOT NULL DEFAULT 0,
        "rating_count" integer NOT NULL DEFAULT 0,
        "total_sales" numeric(14,2) NOT NULL DEFAULT 0,
        "total_orders" integer NOT NULL DEFAULT 0,
        "follower_count" integer NOT NULL DEFAULT 0,
        "is_featured" boolean NOT NULL DEFAULT false,
        "featured_until" timestamptz,
        "stripe_account_id" varchar(255),
        "charges_enabled" boolean NOT NULL DEFAULT false,
        "payouts_enabled" boolean NOT NULL DEFAULT false,
        "details_submitted" boolean NOT NULL DEFAULT false,
        "meta_title" varchar(255),
        "meta_description" varchar(500),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_vendors" PRIMARY KEY ("id"),
        CONSTRAINT "fk_vendors_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_vendors_verified_by" FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_vendors_slug_active" ON "vendors" ("slug") WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_vendors_user_id_active" ON "vendors" ("user_id") WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "vendor_documents" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "vendor_id" uuid NOT NULL,
        "type" "vendor_document_type" NOT NULL,
        "file_url" varchar(1024) NOT NULL,
        "file_name" varchar(255) NOT NULL,
        "file_size" integer,
        "mime_type" varchar(100),
        "expiry_date" date,
        "is_verified" boolean NOT NULL DEFAULT false,
        "verified_at" timestamptz,
        "verified_by" uuid,
        "rejection_reason" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_vendor_documents" PRIMARY KEY ("id"),
        CONSTRAINT "fk_vendor_documents_vendor" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_vendor_documents_verified_by" FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "vendor_bank_accounts" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "vendor_id" uuid NOT NULL,
        "account_holder_name" varchar(255) NOT NULL,
        "bank_name" varchar(255) NOT NULL,
        "account_number_encrypted" varchar(512) NOT NULL,
        "iban_encrypted" varchar(512),
        "swift_code" varchar(20),
        "routing_number" varchar(50),
        "currency" char(3) NOT NULL DEFAULT 'AED',
        "is_primary" boolean NOT NULL DEFAULT false,
        "is_verified" boolean NOT NULL DEFAULT false,
        "verified_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_vendor_bank_accounts" PRIMARY KEY ("id"),
        CONSTRAINT "fk_vendor_bank_accounts_vendor" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "vendor_translations" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "vendor_id" uuid NOT NULL,
        "locale" varchar(10) NOT NULL,
        "name" varchar(255) NOT NULL,
        "description" text,
        "return_policy" text,
        "shipping_policy" text,
        "meta_title" varchar(255),
        "meta_description" varchar(500),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_vendor_translations" PRIMARY KEY ("id"),
        CONSTRAINT "fk_vendor_translations_vendor" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_vendor_translations_vendor_locale" UNIQUE ("vendor_id", "locale")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "vendor_followers" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "vendor_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "followed_at" timestamptz NOT NULL DEFAULT now(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_vendor_followers" PRIMARY KEY ("id"),
        CONSTRAINT "fk_vendor_followers_vendor" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_vendor_followers_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_vendor_followers_vendor_user" UNIQUE ("vendor_id", "user_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "vendor_holidays" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "vendor_id" uuid NOT NULL,
        "name" varchar(255) NOT NULL,
        "starts_at" date NOT NULL,
        "ends_at" date NOT NULL,
        "auto_extend_sla" boolean NOT NULL DEFAULT true,
        "notify_customers" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_vendor_holidays" PRIMARY KEY ("id"),
        CONSTRAINT "fk_vendor_holidays_vendor" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE
      )
    `);

    // ── Catalog ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "categories" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "parent_id" uuid,
        "name" varchar(255) NOT NULL,
        "slug" varchar(255) NOT NULL,
        "description" text,
        "image_url" varchar(1024),
        "icon_url" varchar(1024),
        "banner_url" varchar(1024),
        "is_active" boolean NOT NULL DEFAULT true,
        "is_featured" boolean NOT NULL DEFAULT false,
        "sort_order" integer NOT NULL DEFAULT 0,
        "commission_rate" numeric(5,2),
        "meta_title" varchar(255),
        "meta_description" varchar(500),
        "meta_keywords" varchar(500),
        "path" text,
        "depth" smallint NOT NULL DEFAULT 0,
        "product_count" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_categories" PRIMARY KEY ("id"),
        CONSTRAINT "fk_categories_parent" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_categories_slug_active" ON "categories" ("slug") WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "category_translations" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "category_id" uuid NOT NULL,
        "locale" varchar(10) NOT NULL,
        "name" varchar(255) NOT NULL,
        "description" text,
        "meta_title" varchar(255),
        "meta_description" varchar(500),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_category_translations" PRIMARY KEY ("id"),
        CONSTRAINT "fk_category_translations_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_category_translations_category_locale" UNIQUE ("category_id", "locale")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "attributes" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "name" varchar(100) NOT NULL,
        "slug" varchar(100) NOT NULL UNIQUE,
        "type" "attribute_type" NOT NULL DEFAULT 'text',
        "is_filterable" boolean NOT NULL DEFAULT true,
        "is_searchable" boolean NOT NULL DEFAULT false,
        "is_required" boolean NOT NULL DEFAULT false,
        "is_variant" boolean NOT NULL DEFAULT false,
        "sort_order" smallint NOT NULL DEFAULT 0,
        "validation" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_attributes" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "attribute_translations" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "attribute_id" uuid NOT NULL,
        "locale" varchar(10) NOT NULL,
        "name" varchar(100) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_attribute_translations" PRIMARY KEY ("id"),
        CONSTRAINT "fk_attribute_translations_attribute" FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_attribute_translations_attribute_locale" UNIQUE ("attribute_id", "locale")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "attribute_values" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "attribute_id" uuid NOT NULL,
        "value" varchar(100) NOT NULL,
        "slug" varchar(100) NOT NULL,
        "display_value" varchar(100),
        "color_hex" char(7),
        "swatch_image_url" varchar(1024),
        "sort_order" smallint NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_attribute_values" PRIMARY KEY ("id"),
        CONSTRAINT "fk_attribute_values_attribute" FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_attribute_values_attribute_slug" UNIQUE ("attribute_id", "slug")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "attribute_value_translations" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "attribute_value_id" uuid NOT NULL,
        "locale" varchar(10) NOT NULL,
        "value" varchar(100) NOT NULL,
        "display_value" varchar(100),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_attribute_value_translations" PRIMARY KEY ("id"),
        CONSTRAINT "fk_avt_attribute_value" FOREIGN KEY ("attribute_value_id") REFERENCES "attribute_values"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_avt_attribute_value_locale" UNIQUE ("attribute_value_id", "locale")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "category_attributes" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "category_id" uuid NOT NULL,
        "attribute_id" uuid NOT NULL,
        "is_required" boolean NOT NULL DEFAULT false,
        "sort_order" smallint NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_category_attributes" PRIMARY KEY ("id"),
        CONSTRAINT "fk_ca_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_ca_attribute" FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_category_attributes_category_attribute" UNIQUE ("category_id", "attribute_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "brands" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "name" varchar(255) NOT NULL,
        "slug" varchar(255) NOT NULL UNIQUE,
        "logo_url" varchar(1024),
        "description" text,
        "website_url" varchar(512),
        "is_active" boolean NOT NULL DEFAULT true,
        "is_featured" boolean NOT NULL DEFAULT false,
        "sort_order" integer NOT NULL DEFAULT 0,
        "meta_title" varchar(255),
        "meta_description" varchar(500),
        "product_count" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_brands" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "brand_translations" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "brand_id" uuid NOT NULL,
        "locale" varchar(10) NOT NULL,
        "name" varchar(255) NOT NULL,
        "description" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_brand_translations" PRIMARY KEY ("id"),
        CONSTRAINT "fk_brand_translations_brand" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_brand_translations_brand_locale" UNIQUE ("brand_id", "locale")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "products" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "vendor_id" uuid NOT NULL,
        "category_id" uuid NOT NULL,
        "brand_id" uuid,
        "name" varchar(255) NOT NULL,
        "slug" varchar(255) NOT NULL,
        "short_description" text,
        "description" text,
        "rich_description" jsonb,
        "price" integer NOT NULL,
        "compare_at_price" integer,
        "cost_price" integer,
        "currency" char(3) NOT NULL DEFAULT 'AED',
        "price_overrides" jsonb,
        "is_vat_inclusive" boolean NOT NULL DEFAULT false,
        "tax_rate_id" uuid,
        "status" "product_status" NOT NULL DEFAULT 'draft',
        "published_at" timestamptz,
        "reviewed_at" timestamptz,
        "reviewed_by" uuid,
        "rejection_reason" text,
        "weight_grams" integer,
        "dimensions_cm" jsonb,
        "sku" varchar(50),
        "barcode" varchar(50),
        "mpn" varchar(50),
        "country_of_origin" char(2),
        "is_featured" boolean NOT NULL DEFAULT false,
        "is_digital" boolean NOT NULL DEFAULT false,
        "is_customizable" boolean NOT NULL DEFAULT false,
        "requires_shipping" boolean NOT NULL DEFAULT true,
        "is_age_restricted" boolean NOT NULL DEFAULT false,
        "minimum_age" smallint,
        "track_inventory" boolean NOT NULL DEFAULT true,
        "allow_backorder" boolean NOT NULL DEFAULT false,
        "has_variants" boolean NOT NULL DEFAULT false,
        "rating_avg" numeric(3,2) NOT NULL DEFAULT 0,
        "rating_count" integer NOT NULL DEFAULT 0,
        "view_count" integer NOT NULL DEFAULT 0,
        "sales_count" integer NOT NULL DEFAULT 0,
        "wishlist_count" integer NOT NULL DEFAULT 0,
        "tags" text[],
        "attributes" jsonb,
        "meta_title" varchar(255),
        "meta_description" varchar(500),
        "meta_keywords" varchar(500),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_products" PRIMARY KEY ("id"),
        CONSTRAINT "fk_products_vendor" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_products_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id"),
        CONSTRAINT "fk_products_brand" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_products_slug_active" ON "products" ("slug") WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(`CREATE INDEX "idx_products_vendor" ON "products" ("vendor_id")`);
    await queryRunner.query(`CREATE INDEX "idx_products_status" ON "products" ("status")`);

    await queryRunner.query(`
      CREATE TABLE "product_translations" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "product_id" uuid NOT NULL,
        "locale" varchar(10) NOT NULL,
        "name" varchar(255) NOT NULL,
        "short_description" text,
        "description" text,
        "rich_description" jsonb,
        "meta_title" varchar(255),
        "meta_description" varchar(500),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_product_translations" PRIMARY KEY ("id"),
        CONSTRAINT "fk_product_translations_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_product_translations_product_locale" UNIQUE ("product_id", "locale")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "product_categories" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "product_id" uuid NOT NULL,
        "category_id" uuid NOT NULL,
        "is_primary" boolean NOT NULL DEFAULT false,
        "sort_order" smallint NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_product_categories" PRIMARY KEY ("id"),
        CONSTRAINT "fk_pc_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_pc_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_product_categories_product_category" UNIQUE ("product_id", "category_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "product_images" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "product_id" uuid NOT NULL,
        "variant_id" uuid,
        "url" varchar(1024) NOT NULL,
        "thumbnail_url" varchar(1024),
        "medium_url" varchar(1024),
        "alt_text" varchar(255),
        "is_primary" boolean NOT NULL DEFAULT false,
        "sort_order" smallint NOT NULL DEFAULT 0,
        "width" integer,
        "height" integer,
        "mime_type" varchar(50),
        "file_size" integer,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_product_images" PRIMARY KEY ("id"),
        CONSTRAINT "fk_product_images_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "product_variants" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "product_id" uuid NOT NULL,
        "name" varchar(255) NOT NULL,
        "sku" varchar(100),
        "barcode" varchar(50),
        "option_values" jsonb NOT NULL,
        "price" integer NOT NULL,
        "compare_at_price" integer,
        "cost_price" integer,
        "price_overrides" jsonb,
        "weight_grams" integer,
        "dimensions_cm" jsonb,
        "is_active" boolean NOT NULL DEFAULT true,
        "sort_order" smallint NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_product_variants" PRIMARY KEY ("id"),
        CONSTRAINT "fk_product_variants_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "product_attribute_values" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "product_id" uuid NOT NULL,
        "variant_id" uuid,
        "attribute_id" uuid NOT NULL,
        "attribute_value_id" uuid,
        "text_value" varchar(500),
        "is_visible" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_product_attribute_values" PRIMARY KEY ("id"),
        CONSTRAINT "fk_pav_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_pav_variant" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_pav_attribute" FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_pav_value" FOREIGN KEY ("attribute_value_id") REFERENCES "attribute_values"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "product_relations" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "product_id" uuid NOT NULL,
        "related_product_id" uuid NOT NULL,
        "type" "relation_type" NOT NULL DEFAULT 'related',
        "sort_order" smallint NOT NULL DEFAULT 0,
        "is_auto" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_product_relations" PRIMARY KEY ("id"),
        CONSTRAINT "fk_pr_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_pr_related" FOREIGN KEY ("related_product_id") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_product_relations_product_related_type" UNIQUE ("product_id", "related_product_id", "type")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "product_bundles" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "product_id" uuid NOT NULL,
        "name" varchar(255) NOT NULL,
        "bundle_price" integer NOT NULL,
        "compare_at_price" integer,
        "discount_percentage" numeric(5,2),
        "min_quantity" integer NOT NULL DEFAULT 1,
        "max_quantity" integer,
        "is_active" boolean NOT NULL DEFAULT true,
        "starts_at" timestamptz,
        "expires_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_product_bundles" PRIMARY KEY ("id"),
        CONSTRAINT "fk_product_bundles_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "bundle_items" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "bundle_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "variant_id" uuid,
        "quantity" integer NOT NULL DEFAULT 1,
        "sort_order" smallint NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_bundle_items" PRIMARY KEY ("id"),
        CONSTRAINT "fk_bundle_items_bundle" FOREIGN KEY ("bundle_id") REFERENCES "product_bundles"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_bundle_items_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "product_questions" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "product_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "question" text NOT NULL,
        "answer" text,
        "answered_by" uuid,
        "answered_at" timestamptz,
        "is_published" boolean NOT NULL DEFAULT false,
        "upvote_count" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_product_questions" PRIMARY KEY ("id"),
        CONSTRAINT "fk_pq_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_pq_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "price_history" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "product_id" uuid NOT NULL,
        "variant_id" uuid,
        "old_price" integer NOT NULL,
        "new_price" integer NOT NULL,
        "old_compare_at_price" integer,
        "new_compare_at_price" integer,
        "currency" char(3) NOT NULL DEFAULT 'AED',
        "changed_by" uuid,
        "change_reason" varchar(255),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_price_history" PRIMARY KEY ("id"),
        CONSTRAINT "fk_ph_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);

    // ── Logistics & Delivery ────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "delivery_zones" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "name" varchar(255) NOT NULL,
        "slug" varchar(255) NOT NULL UNIQUE,
        "city" varchar(100) NOT NULL,
        "emirate" varchar(50) NOT NULL,
        "country_code" char(2) NOT NULL DEFAULT 'AE',
        "is_active" boolean NOT NULL DEFAULT true,
        "sort_order" integer NOT NULL DEFAULT 0,
        "boundary" varchar,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_delivery_zones" PRIMARY KEY ("id")
      )
    `);

    // ── Inventory ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "warehouses" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "vendor_id" uuid,
        "name" varchar(255) NOT NULL,
        "code" varchar(50) NOT NULL UNIQUE,
        "address_line_1" varchar(255) NOT NULL,
        "address_line_2" varchar(255),
        "city" varchar(100) NOT NULL,
        "emirate" varchar(50) NOT NULL,
        "country_code" char(2) NOT NULL DEFAULT 'AE',
        "latitude" numeric(10,7),
        "longitude" numeric(10,7),
        "zone_id" uuid,
        "is_active" boolean NOT NULL DEFAULT true,
        "is_default" boolean NOT NULL DEFAULT false,
        "operating_hours" jsonb,
        "contact_phone" varchar(20),
        "contact_email" varchar(255),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_warehouses" PRIMARY KEY ("id"),
        CONSTRAINT "fk_warehouses_vendor" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id"),
        CONSTRAINT "fk_warehouses_zone" FOREIGN KEY ("zone_id") REFERENCES "delivery_zones"("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "inventory" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "product_id" uuid NOT NULL,
        "variant_id" uuid,
        "vendor_id" uuid NOT NULL,
        "warehouse_id" uuid,
        "quantity_on_hand" integer NOT NULL DEFAULT 0,
        "quantity_reserved" integer NOT NULL DEFAULT 0,
        "quantity_available" integer NOT NULL DEFAULT 0,
        "low_stock_threshold" integer NOT NULL DEFAULT 5,
        "reorder_point" integer,
        "max_stock_level" integer,
        "last_restocked_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_inventory" PRIMARY KEY ("id"),
        CONSTRAINT "fk_inventory_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_inventory_variant" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_inventory_vendor" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id"),
        CONSTRAINT "fk_inventory_warehouse" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "inventory_movements" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "inventory_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "variant_id" uuid,
        "quantity" integer NOT NULL,
        "quantity_before" integer NOT NULL,
        "quantity_after" integer NOT NULL,
        "movement_type" varchar(50) NOT NULL,
        "reference_type" varchar(50),
        "reference_id" uuid,
        "notes" text,
        "created_by" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_inventory_movements" PRIMARY KEY ("id"),
        CONSTRAINT "fk_im_inventory" FOREIGN KEY ("inventory_id") REFERENCES "inventory"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "inventory_reservations" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "inventory_id" uuid NOT NULL,
        "order_id" uuid,
        "cart_id" uuid,
        "quantity" integer NOT NULL,
        "status" "reservation_status" NOT NULL DEFAULT 'active',
        "reserved_at" timestamptz NOT NULL DEFAULT now(),
        "expires_at" timestamptz NOT NULL,
        "committed_at" timestamptz,
        "released_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_inventory_reservations" PRIMARY KEY ("id"),
        CONSTRAINT "fk_ir_inventory" FOREIGN KEY ("inventory_id") REFERENCES "inventory"("id") ON DELETE CASCADE
      )
    `);

    // ── Cart ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "carts" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "user_id" uuid,
        "guest_session_id" uuid,
        "coupon_id" uuid,
        "coupon_code" varchar(50),
        "coupon_discount" integer NOT NULL DEFAULT 0,
        "subtotal" integer NOT NULL DEFAULT 0,
        "currency" char(3) NOT NULL DEFAULT 'AED',
        "item_count" integer NOT NULL DEFAULT 0,
        "last_activity_at" timestamptz NOT NULL DEFAULT now(),
        "expires_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_carts" PRIMARY KEY ("id"),
        CONSTRAINT "fk_carts_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_carts_guest_session" FOREIGN KEY ("guest_session_id") REFERENCES "guest_sessions"("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "cart_items" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "cart_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "variant_id" uuid,
        "vendor_id" uuid NOT NULL,
        "quantity" integer NOT NULL DEFAULT 1,
        "unit_price" integer NOT NULL,
        "compare_at_price" integer,
        "line_total" integer NOT NULL,
        "customization_data" jsonb,
        "added_at" timestamptz NOT NULL DEFAULT now(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_cart_items" PRIMARY KEY ("id"),
        CONSTRAINT "fk_cart_items_cart" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_cart_items_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_cart_items_variant" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_cart_items_vendor" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "wishlists" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "user_id" uuid,
        "guest_session_id" uuid,
        "product_id" uuid NOT NULL,
        "variant_id" uuid,
        "added_at" timestamptz NOT NULL DEFAULT now(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_wishlists" PRIMARY KEY ("id"),
        CONSTRAINT "fk_wishlists_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_wishlists_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "recently_viewed" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "user_id" uuid,
        "guest_session_id" uuid,
        "product_id" uuid NOT NULL,
        "viewed_at" timestamptz NOT NULL DEFAULT now(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_recently_viewed" PRIMARY KEY ("id"),
        CONSTRAINT "fk_recently_viewed_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_recently_viewed_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);

    // ── Orders ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "orders" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "order_number" varchar(30) NOT NULL UNIQUE,
        "user_id" uuid NOT NULL,
        "status" "order_status" NOT NULL DEFAULT 'pending_payment',
        "payment_status" "payment_status" NOT NULL DEFAULT 'pending',
        "subtotal" integer NOT NULL,
        "discount_total" integer NOT NULL DEFAULT 0,
        "shipping_total" integer NOT NULL DEFAULT 0,
        "tax_total" integer NOT NULL DEFAULT 0,
        "grand_total" integer NOT NULL,
        "refund_total" integer NOT NULL DEFAULT 0,
        "currency" char(3) NOT NULL DEFAULT 'AED',
        "exchange_rate" numeric(12,6) NOT NULL DEFAULT 1,
        "base_currency" char(3) NOT NULL DEFAULT 'AED',
        "coupon_id" uuid,
        "coupon_code" varchar(50),
        "coupon_discount" integer NOT NULL DEFAULT 0,
        "shipping_address" jsonb NOT NULL,
        "billing_address" jsonb,
        "shipping_method" varchar(100),
        "expected_delivery_date" date,
        "delivered_at" timestamptz,
        "customer_notes" text,
        "admin_notes" text,
        "channel" varchar(50),
        "ip_address" varchar(45),
        "user_agent" varchar(512),
        "attribution" jsonb,
        "is_test_order" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_orders" PRIMARY KEY ("id"),
        CONSTRAINT "fk_orders_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_orders_user" ON "orders" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "idx_orders_status" ON "orders" ("status")`);

    await queryRunner.query(`
      CREATE TABLE "vendor_orders" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "order_id" uuid NOT NULL,
        "vendor_id" uuid NOT NULL,
        "vendor_order_number" varchar(30) NOT NULL UNIQUE,
        "status" "order_status" NOT NULL DEFAULT 'confirmed',
        "subtotal" integer NOT NULL,
        "shipping_cost" integer NOT NULL DEFAULT 0,
        "tax_total" integer NOT NULL DEFAULT 0,
        "vendor_total" integer NOT NULL,
        "currency" char(3) NOT NULL DEFAULT 'AED',
        "exchange_rate" numeric(12,6) NOT NULL DEFAULT 1,
        "processing_deadline" timestamptz,
        "vendor_notes" text,
        "accepted_at" timestamptz,
        "rejected_at" timestamptz,
        "rejection_reason" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_vendor_orders" PRIMARY KEY ("id"),
        CONSTRAINT "fk_vendor_orders_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_vendor_orders_vendor" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "order_items" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "order_id" uuid NOT NULL,
        "vendor_order_id" uuid NOT NULL,
        "vendor_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "variant_id" uuid,
        "product_name" varchar(255) NOT NULL,
        "variant_name" varchar(255),
        "product_sku" varchar(100),
        "product_image_url" varchar(1024),
        "product_snapshot" jsonb,
        "quantity" integer NOT NULL,
        "unit_price" integer NOT NULL,
        "compare_at_price" integer,
        "discount_amount" integer NOT NULL DEFAULT 0,
        "tax_amount" integer NOT NULL DEFAULT 0,
        "tax_rate" numeric(5,2) NOT NULL DEFAULT 5,
        "line_total" integer NOT NULL,
        "refunded_quantity" integer NOT NULL DEFAULT 0,
        "refunded_amount" integer NOT NULL DEFAULT 0,
        "is_reviewed" boolean NOT NULL DEFAULT false,
        "status" "order_status" NOT NULL DEFAULT 'confirmed',
        "customization_data" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_order_items" PRIMARY KEY ("id"),
        CONSTRAINT "fk_oi_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_oi_vendor_order" FOREIGN KEY ("vendor_order_id") REFERENCES "vendor_orders"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_oi_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "order_status_history" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "order_id" uuid NOT NULL,
        "vendor_order_id" uuid,
        "order_item_id" uuid,
        "from_status" varchar(50),
        "to_status" varchar(50) NOT NULL,
        "comment" text,
        "is_customer_visible" boolean NOT NULL DEFAULT true,
        "changed_by" uuid,
        "changed_by_role" varchar(50),
        "metadata" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_order_status_history" PRIMARY KEY ("id"),
        CONSTRAINT "fk_osh_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE
      )
    `);

    // ── Shipments ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "shipments" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "order_id" uuid NOT NULL,
        "vendor_order_id" uuid NOT NULL,
        "vendor_id" uuid NOT NULL,
        "warehouse_id" uuid,
        "tracking_number" varchar(100),
        "carrier" varchar(100),
        "carrier_service" varchar(100),
        "tracking_url" varchar(1024),
        "status" "shipment_status" NOT NULL DEFAULT 'pending',
        "shipped_at" timestamptz,
        "estimated_delivery_at" timestamptz,
        "delivered_at" timestamptz,
        "weight_grams" integer,
        "shipping_cost" integer,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_shipments" PRIMARY KEY ("id"),
        CONSTRAINT "fk_shipments_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id"),
        CONSTRAINT "fk_shipments_vendor_order" FOREIGN KEY ("vendor_order_id") REFERENCES "vendor_orders"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_shipments_vendor" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "shipment_events" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "shipment_id" uuid NOT NULL,
        "status" "shipment_status" NOT NULL,
        "location" varchar(255),
        "description" text,
        "occurred_at" timestamptz NOT NULL,
        "raw_payload" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_shipment_events" PRIMARY KEY ("id"),
        CONSTRAINT "fk_se_shipment" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "shipment_items" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "shipment_id" uuid NOT NULL,
        "order_item_id" uuid NOT NULL,
        "quantity" integer NOT NULL,
        "is_delivered" boolean NOT NULL DEFAULT false,
        "delivered_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_shipment_items" PRIMARY KEY ("id"),
        CONSTRAINT "fk_si_shipment" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_si_order_item" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE
      )
    `);

    // ── Returns & Disputes ──────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "returns" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "return_number" varchar(30) NOT NULL UNIQUE,
        "order_id" uuid NOT NULL,
        "vendor_order_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "vendor_id" uuid NOT NULL,
        "status" "return_status" NOT NULL DEFAULT 'requested',
        "reason" "return_reason" NOT NULL,
        "reason_details" text,
        "media_urls" jsonb NOT NULL DEFAULT '[]',
        "return_shipping_carrier" varchar(100),
        "return_tracking_number" varchar(100),
        "return_shipping_cost" integer,
        "return_shipping_paid_by" varchar(20),
        "refund_amount" integer,
        "refund_method" varchar(50),
        "refunded_at" timestamptz,
        "approved_at" timestamptz,
        "approved_by" uuid,
        "rejected_at" timestamptz,
        "rejection_reason" text,
        "received_at" timestamptz,
        "restocked" boolean NOT NULL DEFAULT false,
        "admin_notes" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_returns" PRIMARY KEY ("id"),
        CONSTRAINT "fk_returns_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_returns_vendor_order" FOREIGN KEY ("vendor_order_id") REFERENCES "vendor_orders"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_returns_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_returns_vendor" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "return_items" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "return_id" uuid NOT NULL,
        "order_item_id" uuid NOT NULL,
        "quantity" integer NOT NULL,
        "reason" "return_reason" NOT NULL,
        "condition" varchar(50),
        "refund_amount" integer,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_return_items" PRIMARY KEY ("id"),
        CONSTRAINT "fk_ri_return" FOREIGN KEY ("return_id") REFERENCES "returns"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_ri_order_item" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "disputes" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "dispute_number" varchar(30) NOT NULL UNIQUE,
        "order_id" uuid NOT NULL,
        "vendor_order_id" uuid,
        "opened_by" uuid NOT NULL,
        "vendor_id" uuid NOT NULL,
        "assigned_to" uuid,
        "status" "dispute_status" NOT NULL DEFAULT 'opened',
        "category" varchar(100) NOT NULL,
        "description" text NOT NULL,
        "evidence_urls" jsonb NOT NULL DEFAULT '[]',
        "resolution" text,
        "resolution_amount" integer,
        "resolved_at" timestamptz,
        "resolved_by" uuid,
        "escalated_at" timestamptz,
        "deadline_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_disputes" PRIMARY KEY ("id"),
        CONSTRAINT "fk_disputes_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_disputes_opened_by" FOREIGN KEY ("opened_by") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_disputes_vendor" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "dispute_messages" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "dispute_id" uuid NOT NULL,
        "sender_id" uuid NOT NULL,
        "sender_role" varchar(20) NOT NULL,
        "message" text NOT NULL,
        "attachment_urls" jsonb NOT NULL DEFAULT '[]',
        "is_internal" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_dispute_messages" PRIMARY KEY ("id"),
        CONSTRAINT "fk_dm_dispute" FOREIGN KEY ("dispute_id") REFERENCES "disputes"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_dm_sender" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // ── Payments ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "order_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "status" "payment_status" NOT NULL DEFAULT 'pending',
        "payment_method" "payment_method" NOT NULL,
        "amount" integer NOT NULL,
        "currency" char(3) NOT NULL DEFAULT 'AED',
        "gateway" varchar(50) NOT NULL,
        "gateway_transaction_id" varchar(255),
        "gateway_payment_id" varchar(255),
        "gateway_order_id" varchar(255),
        "gateway_response" jsonb,
        "card_last4" char(4),
        "card_brand" varchar(20),
        "card_expiry" varchar(7),
        "refunded_amount" integer NOT NULL DEFAULT 0,
        "refund_reason" text,
        "refunded_at" timestamptz,
        "authorized_at" timestamptz,
        "captured_at" timestamptz,
        "failed_at" timestamptz,
        "failure_reason" text,
        "ip_address" varchar(45),
        "is_test" boolean NOT NULL DEFAULT false,
        "three_ds_status" varchar(50),
        "three_ds_redirect_url" varchar(1024),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_payments" PRIMARY KEY ("id"),
        CONSTRAINT "fk_payments_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_payments_user" FOREIGN KEY ("user_id") REFERENCES "users"("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "webhook_events" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "gateway" varchar(50) NOT NULL,
        "event_type" varchar(100) NOT NULL,
        "event_id" varchar(255) NOT NULL,
        "payload" jsonb NOT NULL,
        "status" "webhook_status" NOT NULL DEFAULT 'pending',
        "processed_at" timestamptz,
        "error_message" text,
        "attempts" smallint NOT NULL DEFAULT 0,
        "last_attempt_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_webhook_events" PRIMARY KEY ("id"),
        CONSTRAINT "uq_webhook_events_gateway_event_id" UNIQUE ("gateway", "event_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "tax_rates" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "name" varchar(255) NOT NULL,
        "rate" numeric(5,2) NOT NULL,
        "country_code" char(2) NOT NULL DEFAULT 'AE',
        "emirate" varchar(50),
        "category_id" uuid,
        "zone_type" varchar(50),
        "is_default" boolean NOT NULL DEFAULT false,
        "effective_from" date NOT NULL,
        "effective_until" date,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_tax_rates" PRIMARY KEY ("id"),
        CONSTRAINT "fk_tax_rates_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "commissions" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "vendor_id" uuid NOT NULL,
        "order_id" uuid NOT NULL,
        "vendor_order_id" uuid NOT NULL,
        "order_item_id" uuid NOT NULL,
        "payout_id" uuid,
        "commission_type" "commission_type" NOT NULL,
        "commission_rate" numeric(8,4) NOT NULL,
        "item_total" integer NOT NULL,
        "commission_amount" integer NOT NULL,
        "tax_on_commission" integer NOT NULL DEFAULT 0,
        "vendor_earning" integer NOT NULL,
        "currency" char(3) NOT NULL DEFAULT 'AED',
        "status" "commission_status" NOT NULL DEFAULT 'pending',
        "approved_at" timestamptz,
        "paid_at" timestamptz,
        "adjustment_amount" integer NOT NULL DEFAULT 0,
        "adjustment_reason" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_commissions" PRIMARY KEY ("id"),
        CONSTRAINT "fk_commissions_vendor" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_commissions_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_commissions_vendor_order" FOREIGN KEY ("vendor_order_id") REFERENCES "vendor_orders"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_commissions_order_item" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "vendor_payouts" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "vendor_id" uuid NOT NULL,
        "bank_account_id" uuid NOT NULL,
        "payout_reference" varchar(50) NOT NULL UNIQUE,
        "period_start" date NOT NULL,
        "period_end" date NOT NULL,
        "gross_amount" integer NOT NULL,
        "commission_total" integer NOT NULL,
        "adjustment_total" integer NOT NULL DEFAULT 0,
        "net_amount" integer NOT NULL,
        "currency" char(3) NOT NULL DEFAULT 'AED',
        "status" "payout_status" NOT NULL DEFAULT 'pending',
        "gateway_reference" varchar(255),
        "processed_at" timestamptz,
        "notes" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_vendor_payouts" PRIMARY KEY ("id"),
        CONSTRAINT "fk_vendor_payouts_vendor" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_vendor_payouts_bank_account" FOREIGN KEY ("bank_account_id") REFERENCES "vendor_bank_accounts"("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "wallet_transactions" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "user_id" uuid NOT NULL,
        "amount" integer NOT NULL,
        "currency" char(3) NOT NULL DEFAULT 'AED',
        "balance_before" integer NOT NULL,
        "balance_after" integer NOT NULL,
        "transaction_type" varchar(50) NOT NULL,
        "order_id" uuid,
        "reference_type" varchar(50),
        "reference_id" uuid,
        "description" text,
        "expires_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_wallet_transactions" PRIMARY KEY ("id"),
        CONSTRAINT "fk_wt_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "gift_cards" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "code" varchar(50) NOT NULL UNIQUE,
        "initial_balance" integer NOT NULL,
        "current_balance" integer NOT NULL,
        "currency" char(3) NOT NULL DEFAULT 'AED',
        "status" "gift_card_status" NOT NULL DEFAULT 'active',
        "purchased_by" uuid,
        "recipient_email" varchar(255),
        "recipient_name" varchar(100),
        "personal_message" text,
        "expires_at" timestamptz,
        "purchase_order_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_gift_cards" PRIMARY KEY ("id"),
        CONSTRAINT "fk_gift_cards_purchaser" FOREIGN KEY ("purchased_by") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "gift_card_transactions" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "gift_card_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "order_id" uuid,
        "amount" integer NOT NULL,
        "balance_before" integer NOT NULL,
        "balance_after" integer NOT NULL,
        "description" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_gift_card_transactions" PRIMARY KEY ("id"),
        CONSTRAINT "fk_gct_gift_card" FOREIGN KEY ("gift_card_id") REFERENCES "gift_cards"("id") ON DELETE CASCADE
      )
    `);

    // ── Reviews & Promos ────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "reviews" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "product_id" uuid NOT NULL,
        "vendor_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "order_item_id" uuid NOT NULL UNIQUE,
        "variant_id" uuid,
        "rating" smallint NOT NULL,
        "title" varchar(255),
        "body" text,
        "media_urls" jsonb NOT NULL DEFAULT '[]',
        "status" "review_status" NOT NULL DEFAULT 'pending',
        "approved_at" timestamptz,
        "approved_by" uuid,
        "rejection_reason" text,
        "vendor_reply" text,
        "vendor_replied_at" timestamptz,
        "helpful_count" integer NOT NULL DEFAULT 0,
        "not_helpful_count" integer NOT NULL DEFAULT 0,
        "is_verified_purchase" boolean NOT NULL DEFAULT true,
        "is_featured" boolean NOT NULL DEFAULT false,
        "quality_rating" smallint,
        "value_rating" smallint,
        "shipping_rating" smallint,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_reviews" PRIMARY KEY ("id"),
        CONSTRAINT "fk_reviews_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_reviews_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "chk_reviews_rating" CHECK ("rating" >= 1 AND "rating" <= 5)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "review_votes" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "review_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "is_helpful" boolean NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_review_votes" PRIMARY KEY ("id"),
        CONSTRAINT "fk_rv_review" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_rv_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_review_votes_review_user" UNIQUE ("review_id", "user_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "coupons" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "code" varchar(50) NOT NULL,
        "name" varchar(255) NOT NULL,
        "description" text,
        "type" "coupon_type" NOT NULL,
        "applicable_to" "coupon_applicable_to" NOT NULL DEFAULT 'all',
        "vendor_id" uuid,
        "discount_value" integer NOT NULL,
        "max_discount_amount" integer,
        "currency" char(3) NOT NULL DEFAULT 'AED',
        "minimum_order_amount" integer,
        "minimum_quantity" integer,
        "usage_limit" integer,
        "usage_limit_per_user" integer,
        "usage_count" integer NOT NULL DEFAULT 0,
        "starts_at" timestamptz,
        "expires_at" timestamptz,
        "is_active" boolean NOT NULL DEFAULT true,
        "is_single_use" boolean NOT NULL DEFAULT false,
        "is_public" boolean NOT NULL DEFAULT true,
        "buy_quantity" integer,
        "get_quantity" integer,
        "get_discount_percentage" numeric(5,2),
        "first_order_only" boolean NOT NULL DEFAULT false,
        "new_users_only" boolean NOT NULL DEFAULT false,
        "created_by" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_coupons" PRIMARY KEY ("id"),
        CONSTRAINT "fk_coupons_creator" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_coupons_vendor" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_coupons_code_active" ON "coupons" ("code") WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "coupon_products" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "coupon_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_coupon_products" PRIMARY KEY ("id"),
        CONSTRAINT "fk_cp_coupon" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_cp_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "coupon_categories" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "coupon_id" uuid NOT NULL,
        "category_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_coupon_categories" PRIMARY KEY ("id"),
        CONSTRAINT "fk_cc_coupon" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_cc_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "coupon_vendors" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "coupon_id" uuid NOT NULL,
        "vendor_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_coupon_vendors" PRIMARY KEY ("id"),
        CONSTRAINT "fk_cv_coupon" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_cv_vendor" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "coupon_excluded_products" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "coupon_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_coupon_excluded_products" PRIMARY KEY ("id"),
        CONSTRAINT "fk_cep_coupon" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_cep_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "coupon_user_restrictions" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "coupon_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_coupon_user_restrictions" PRIMARY KEY ("id"),
        CONSTRAINT "fk_cur_coupon" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_cur_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "coupon_usages" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "coupon_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "order_id" uuid NOT NULL,
        "discount_applied" integer NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_coupon_usages" PRIMARY KEY ("id"),
        CONSTRAINT "fk_cu_coupon" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_cu_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_cu_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "flash_deals" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "product_id" uuid NOT NULL,
        "variant_id" uuid,
        "vendor_id" uuid NOT NULL,
        "title" varchar(255) NOT NULL,
        "deal_price" integer NOT NULL,
        "original_price" integer NOT NULL,
        "discount_percentage" numeric(5,2) NOT NULL,
        "quantity_limit" integer,
        "quantity_sold" integer NOT NULL DEFAULT 0,
        "starts_at" timestamptz NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_flash_deals" PRIMARY KEY ("id"),
        CONSTRAINT "fk_flash_deals_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "referrals" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "referrer_id" uuid NOT NULL,
        "referred_id" uuid,
        "referral_code" varchar(50) NOT NULL UNIQUE,
        "referred_email" varchar(255),
        "status" varchar(50) NOT NULL,
        "referrer_reward_amount" integer,
        "referred_reward_amount" integer,
        "qualifying_order_id" uuid,
        "rewarded_at" timestamptz,
        "expires_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_referrals" PRIMARY KEY ("id"),
        CONSTRAINT "fk_referrals_referrer" FOREIGN KEY ("referrer_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_referrals_referred" FOREIGN KEY ("referred_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "shipping_rates" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "vendor_id" uuid,
        "zone_id" uuid,
        "name" varchar(255) NOT NULL,
        "method" varchar(100) NOT NULL,
        "min_weight_grams" integer,
        "max_weight_grams" integer,
        "min_order_amount" integer,
        "base_cost" integer NOT NULL,
        "per_kg_cost" integer NOT NULL DEFAULT 0,
        "free_above" integer,
        "currency" char(3) NOT NULL DEFAULT 'AED',
        "estimated_days_min" smallint,
        "estimated_days_max" smallint,
        "is_active" boolean NOT NULL DEFAULT true,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_shipping_rates" PRIMARY KEY ("id"),
        CONSTRAINT "fk_sr_vendor" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_sr_delivery_zone" FOREIGN KEY ("zone_id") REFERENCES "delivery_zones"("id") ON DELETE SET NULL
      )
    `);

    // ── Platform & CMS ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "site_settings" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "key" varchar(255) NOT NULL,
        "value" text NOT NULL,
        "value_type" varchar(20) NOT NULL,
        "setting_group" varchar(100),
        "description" text,
        "updated_by" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_site_settings" PRIMARY KEY ("id"),
        CONSTRAINT "fk_site_settings_user" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_site_settings_key_active" ON "site_settings" ("key") WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "audit_log" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "actor_id" uuid,
        "actor_role" varchar(50) NOT NULL,
        "action" varchar(100) NOT NULL,
        "entity_type" varchar(100) NOT NULL,
        "entity_id" uuid,
        "changes" jsonb,
        "ip_address" varchar(45),
        "user_agent" varchar(512),
        "metadata" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_audit_log" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "pages" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "title" varchar(255) NOT NULL,
        "slug" varchar(255) NOT NULL,
        "content" text,
        "rich_content" jsonb,
        "status" "page_status" NOT NULL DEFAULT 'draft',
        "published_at" timestamptz,
        "author_id" uuid,
        "locale" varchar(10) NOT NULL DEFAULT 'en',
        "meta_title" varchar(255),
        "meta_description" varchar(500),
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_pages" PRIMARY KEY ("id"),
        CONSTRAINT "fk_pages_author" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_pages_slug_active" ON "pages" ("slug") WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "banners" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "title" varchar(255) NOT NULL,
        "subtitle" varchar(500),
        "image_url" varchar(1024) NOT NULL,
        "mobile_image_url" varchar(1024),
        "link_url" varchar(1024),
        "placement" varchar(100) NOT NULL,
        "starts_at" timestamptz,
        "expires_at" timestamptz,
        "is_active" boolean NOT NULL DEFAULT true,
        "sort_order" integer NOT NULL DEFAULT 0,
        "locale" varchar(10),
        "target_audience" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_banners" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "support_tickets" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "ticket_number" varchar(30) NOT NULL UNIQUE,
        "user_id" uuid NOT NULL,
        "assigned_to" uuid,
        "order_id" uuid,
        "subject" varchar(255) NOT NULL,
        "status" "ticket_status" NOT NULL DEFAULT 'open',
        "priority" "ticket_priority" NOT NULL DEFAULT 'medium',
        "category" varchar(100),
        "resolved_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_support_tickets" PRIMARY KEY ("id"),
        CONSTRAINT "fk_st_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_st_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "support_messages" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "ticket_id" uuid NOT NULL,
        "sender_id" uuid NOT NULL,
        "sender_role" varchar(20) NOT NULL,
        "message" text NOT NULL,
        "attachment_urls" jsonb NOT NULL DEFAULT '[]',
        "is_internal" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_support_messages" PRIMARY KEY ("id"),
        CONSTRAINT "fk_sm_ticket" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_sm_sender" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "cart_abandoned" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "cart_id" uuid NOT NULL,
        "user_id" uuid,
        "guest_session_id" uuid,
        "email" varchar(255),
        "cart_snapshot" jsonb NOT NULL,
        "cart_total" integer NOT NULL,
        "currency" char(3) NOT NULL DEFAULT 'AED',
        "item_count" integer NOT NULL DEFAULT 0,
        "reminder_sent_count" smallint NOT NULL DEFAULT 0,
        "last_reminder_at" timestamptz,
        "recovered_at" timestamptz,
        "recovered_order_id" uuid,
        "abandoned_at" timestamptz NOT NULL DEFAULT now(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_cart_abandoned" PRIMARY KEY ("id"),
        CONSTRAINT "fk_ca_cart" FOREIGN KEY ("cart_id") REFERENCES "carts"("id"),
        CONSTRAINT "fk_ca_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop tables in reverse dependency order
    const tables = [
      "cart_abandoned",
      "support_messages",
      "support_tickets",
      "banners",
      "pages",
      "audit_log",
      "site_settings",
      "shipping_rates",
      "referrals",
      "flash_deals",
      "coupon_usages",
      "coupon_user_restrictions",
      "coupon_excluded_products",
      "coupon_vendors",
      "coupon_categories",
      "coupon_products",
      "coupons",
      "review_votes",
      "reviews",
      "gift_card_transactions",
      "gift_cards",
      "wallet_transactions",
      "vendor_payouts",
      "commissions",
      "webhook_events",
      "tax_rates",
      "payments",
      "dispute_messages",
      "disputes",
      "return_items",
      "returns",
      "shipment_items",
      "shipment_events",
      "shipments",
      "order_status_history",
      "order_items",
      "vendor_orders",
      "orders",
      "recently_viewed",
      "wishlists",
      "cart_items",
      "carts",
      "inventory_reservations",
      "inventory_movements",
      "inventory",
      "warehouses",
      "delivery_zones",
      "price_history",
      "product_questions",
      "bundle_items",
      "product_bundles",
      "product_relations",
      "product_attribute_values",
      "product_variants",
      "product_images",
      "product_categories",
      "product_translations",
      "products",
      "brand_translations",
      "brands",
      "category_attributes",
      "attribute_value_translations",
      "attribute_values",
      "attribute_translations",
      "attributes",
      "category_translations",
      "categories",
      "vendor_holidays",
      "vendor_followers",
      "vendor_translations",
      "vendor_bank_accounts",
      "vendor_documents",
      "vendors",
      "saved_searches",
      "notification_preferences",
      "notifications",
      "guest_sessions",
      "user_two_factor",
      "user_tokens",
      "user_sessions",
      "user_addresses",
      "users",
    ];

    for (const table of tables) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
    }

    // Drop enum types
    const enums = [
      "page_status",
      "ticket_priority",
      "ticket_status",
      "coupon_applicable_to",
      "coupon_type",
      "webhook_status",
      "gift_card_status",
      "payment_method",
      "payment_status",
      "dispute_status",
      "return_reason",
      "return_status",
      "shipment_status",
      "order_status",
      "review_status",
      "reservation_status",
      "relation_type",
      "attribute_type",
      "product_status",
      "payout_status",
      "commission_status",
      "commission_type",
      "vendor_document_type",
      "vendor_status",
      "notification_channel",
      "notification_type",
      "token_type",
      "address_type",
      "user_status",
      "user_role",
    ];

    for (const enumType of enums) {
      await queryRunner.query(`DROP TYPE IF EXISTS "${enumType}" CASCADE`);
    }
  }
}
