import type { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1793280320802 implements MigrationInterface {
  name = "InitialSchema1793280320802";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('super_admin', 'admin', 'customer', 'guest')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_status_enum" AS ENUM('active', 'inactive', 'suspended', 'pending_verification')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "first_name" character varying(100) NOT NULL, "last_name" character varying(100) NOT NULL, "email" character varying(255) NOT NULL, "phone" character varying(20), "phone_verified_at" TIMESTAMP WITH TIME ZONE, "email_verified_at" TIMESTAMP WITH TIME ZONE, "password_hash" character varying(255) NOT NULL, "must_change_password" boolean NOT NULL DEFAULT false, "token_version" integer NOT NULL DEFAULT '1', "role" "public"."users_role_enum" NOT NULL DEFAULT 'customer', "status" "public"."users_status_enum" NOT NULL DEFAULT 'pending_verification', "avatar_url" character varying(1024), "preferred_locale" character varying(10) NOT NULL DEFAULT 'en', "preferred_currency" character varying(3) NOT NULL DEFAULT 'AED', "fcm_token" character varying(512), "last_login_at" TIMESTAMP WITH TIME ZONE, "login_attempts" smallint NOT NULL DEFAULT '0', "locked_until" TIMESTAMP WITH TIME ZONE, "google_id" character varying(255), "apple_id" character varying(255), "wallet_balance" integer NOT NULL DEFAULT '0', "wallet_currency" character varying(3) NOT NULL DEFAULT 'AED', "follower_count" integer NOT NULL DEFAULT '0', "following_count" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_b383987bfa6e6a8745085621d0" ON "users" ("email") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."user_addresses_type_enum" AS ENUM('shipping', 'billing', 'both')`,
    );
    await queryRunner.query(
      `CREATE TABLE "user_addresses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "label" character varying(100) NOT NULL, "type" "public"."user_addresses_type_enum" NOT NULL, "first_name" character varying(100) NOT NULL, "last_name" character varying(100) NOT NULL, "phone" character varying(20) NOT NULL, "address_line_1" character varying(255) NOT NULL, "address_line_2" character varying(255), "building_name" character varying(150), "apartment" character varying(50), "floor" character varying(50), "city" character varying(100) NOT NULL, "state" character varying(100), "postal_code" character varying(20), "country_code" character(2) NOT NULL, "latitude" numeric(10,7), "longitude" numeric(10,7), "area_id" uuid, "is_default" boolean NOT NULL DEFAULT false, "delivery_notes" character varying(500), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_8abbeb5e3239ff7877088ffc25b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "phone_auth_challenges" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "phone" character varying(20) NOT NULL, "token_hash" character varying(255) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE, "ip_address" character varying(45), "user_agent" character varying(512), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_f3c6d04dbea153027f74f699bd7" UNIQUE ("token_hash"), CONSTRAINT "PK_2da4bb62185733e29c1f4cbfa8c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_733a1b0ce482d8dad7fdfaf652" ON "phone_auth_challenges" ("phone") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_d1c8d069847e5ae1783ef6e7ed" ON "phone_auth_challenges" ("token_hash") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "user_verified_phones" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "phone" character varying(20) NOT NULL, "verified_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_8279ed44b1adda0c89e43b8213b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_user_verified_phone" ON "user_verified_phones" ("user_id", "phone") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "user_sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "refresh_token_hash" character varying(255) NOT NULL, "device_info" jsonb, "ip_address" character varying(45), "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "is_revoked" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_e93e031a5fed190d4789b6bfd83" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."user_tokens_type_enum" AS ENUM('email_verify', 'password_reset', 'two_fa_setup', 'magic_link')`,
    );
    await queryRunner.query(
      `CREATE TABLE "user_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "token_hash" character varying(255) NOT NULL, "type" "public"."user_tokens_type_enum" NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE, "ip_address" character varying(45), "user_agent" character varying(512), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_ebdd918653813b59cdd5d379b5b" UNIQUE ("token_hash"), CONSTRAINT "PK_63764db9d9aaa4af33e07b2f4bf" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_8439498e5cddde50e3b87c5134" ON "user_tokens" ("token_hash") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "user_two_factor" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "secret_encrypted" text NOT NULL, "is_enabled" boolean NOT NULL DEFAULT false, "enabled_at" TIMESTAMP WITH TIME ZONE, "backup_codes_encrypted" text NOT NULL DEFAULT '[]', "last_used_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_0e865d85e0ad6329b40523afe55" UNIQUE ("user_id"), CONSTRAINT "REL_0e865d85e0ad6329b40523afe5" UNIQUE ("user_id"), CONSTRAINT "PK_a0dc97e08540c59d6c744e21c58" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notifications_type_enum" AS ENUM('order_update', 'payment', 'promotion', 'system', 'vendor', 'order_confirmed', 'order_shipped', 'order_delivered', 'payment_received', 'payout_sent', 'new_review', 'low_stock', 'vendor_approved', 'return_requested', 'dispute_opened', 'dispute_resolved', 'vendor_new_order')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notifications_channel_enum" AS ENUM('email', 'push', 'sms', 'in_app', 'whatsapp')`,
    );
    await queryRunner.query(
      `CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "type" "public"."notifications_type_enum" NOT NULL, "channel" "public"."notifications_channel_enum" NOT NULL DEFAULT 'in_app', "title" character varying(255) NOT NULL, "body" text NOT NULL, "data" jsonb, "is_read" boolean NOT NULL DEFAULT false, "read_at" TIMESTAMP WITH TIME ZONE, "action_url" character varying(1024), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notification_preferences_notification_type_enum" AS ENUM('order_update', 'payment', 'promotion', 'system', 'vendor', 'order_confirmed', 'order_shipped', 'order_delivered', 'payment_received', 'payout_sent', 'new_review', 'low_stock', 'vendor_approved', 'return_requested', 'dispute_opened', 'dispute_resolved', 'vendor_new_order')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notification_preferences_channel_enum" AS ENUM('email', 'push', 'sms', 'in_app', 'whatsapp')`,
    );
    await queryRunner.query(
      `CREATE TABLE "notification_preferences" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "notification_type" "public"."notification_preferences_notification_type_enum" NOT NULL, "channel" "public"."notification_preferences_channel_enum" NOT NULL, "enabled" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_5d14f5e0612290ba6a315474d7b" UNIQUE ("user_id", "notification_type", "channel"), CONSTRAINT "PK_e94e2b543f2f218ee68e4f4fad2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "newsletter_subscribers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" text NOT NULL, "user_id" uuid, "locale" text NOT NULL DEFAULT 'en', "source" text NOT NULL DEFAULT 'homepage', "subscribed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "unsubscribed_at" TIMESTAMP WITH TIME ZONE, "unsubscribe_token" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_38f9333e9961b2fdb589128d19b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "guest_sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "session_token" character varying(255) NOT NULL, "fingerprint_hash" character varying(255), "ip_address" character varying(45), "user_agent" character varying(512), "preferred_locale" character varying(10) NOT NULL DEFAULT 'en', "preferred_currency" character varying(3) NOT NULL DEFAULT 'AED', "merged_to_user_id" uuid, "merged_at" TIMESTAMP WITH TIME ZONE, "last_active_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_156ffe6484249f432cd081eff30" UNIQUE ("session_token"), CONSTRAINT "PK_7c077389b040139ae9487c1b03e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_156ffe6484249f432cd081eff3" ON "guest_sessions" ("session_token") `,
    );
    await queryRunner.query(
      `CREATE TABLE "recently_viewed" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid, "guest_session_id" uuid, "product_id" uuid NOT NULL, "viewed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_69c131fcd783f4d5a30f6bbcfd3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "saved_searches" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "name" character varying(255), "query" character varying(500) NOT NULL, "filters" jsonb, "notify_on_match" boolean NOT NULL DEFAULT false, "last_notified_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_d9a53c71ccc5cf66dcdc5b33dfe" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "recent_searches" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "query" text NOT NULL, "last_used_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_be062c120d505d479cb3113f1cc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_566b01af8b6063d48a27626679" ON "recent_searches" ("user_id", "last_used_at") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."vendors_status_enum" AS ENUM('pending', 'under_review', 'approved', 'rejected', 'suspended', 'deactivated')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."vendors_commission_type_enum" AS ENUM('percentage', 'fixed', 'tiered')`,
    );
    await queryRunner.query(
      `CREATE TABLE "vendors" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(255) NOT NULL, "slug" character varying(255) NOT NULL, "description" text, "founded_year" smallint, "story" text, "logo_url" character varying(1024), "banner_url" character varying(1024), "cover_images" jsonb NOT NULL DEFAULT '[]', "status" "public"."vendors_status_enum" NOT NULL DEFAULT 'pending', "verified_at" TIMESTAMP WITH TIME ZONE, "verified_by" uuid, "rejection_reason" text, "business_name" character varying(255) NOT NULL, "business_type" character varying(100) NOT NULL, "trade_license_number" character varying(100), "vat_number" character varying(50), "vat_registered" boolean NOT NULL DEFAULT false, "contact_email" character varying(255) NOT NULL, "contact_phone" character varying(20) NOT NULL, "whatsapp" character varying(20), "website_url" character varying(512), "address" jsonb, "social_links" jsonb NOT NULL DEFAULT '{}', "commission_type" "public"."vendors_commission_type_enum", "commission_value" numeric(8,4), "commission_tiers" jsonb, "payout_schedule" character varying(50) NOT NULL DEFAULT 'biweekly', "minimum_payout" integer NOT NULL DEFAULT '10000', "settlement_window_days" integer, "auto_approve_orders" boolean NOT NULL DEFAULT true, "services_trusted" boolean NOT NULL DEFAULT false, "auto_create_shipment" boolean NOT NULL DEFAULT true, "default_carrier" character varying(100), "default_shipping_account_id" uuid, "processing_time_days" smallint NOT NULL DEFAULT '2', "response_time_hours" smallint, "return_policy" text, "shipping_policy" text, "rating_avg" numeric(3,2) NOT NULL DEFAULT '0', "rating_count" integer NOT NULL DEFAULT '0', "total_sales" numeric(14,2) NOT NULL DEFAULT '0', "total_orders" integer NOT NULL DEFAULT '0', "follower_count" integer NOT NULL DEFAULT '0', "is_featured" boolean NOT NULL DEFAULT false, "featured_until" TIMESTAMP WITH TIME ZONE, "stripe_account_id" character varying(255), "charges_enabled" boolean NOT NULL DEFAULT false, "payouts_enabled" boolean NOT NULL DEFAULT false, "details_submitted" boolean NOT NULL DEFAULT false, "meta_title" character varying(255), "meta_description" character varying(500), "exclude_from_channel_feeds" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_7188425e2c26bcd0516fbbcd1be" UNIQUE ("slug"), CONSTRAINT "PK_9c956c9797edfae5c6ddacc4e6e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_750a10541e8f8048d076bed731" ON "vendors" ("slug") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "vendor_ai_usage" ("vendor_id" uuid NOT NULL, "month" character(7) NOT NULL, "count" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_1af24a23d93ec0dc2e56179785b" PRIMARY KEY ("vendor_id", "month"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."vendor_documents_type_enum" AS ENUM('trade_license', 'vat_certificate', 'emirates_id', 'passport', 'bank_statement', 'other')`,
    );
    await queryRunner.query(
      `CREATE TABLE "vendor_documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "vendor_id" uuid NOT NULL, "type" "public"."vendor_documents_type_enum" NOT NULL, "file_url" character varying(1024) NOT NULL, "file_name" character varying(255) NOT NULL, "file_size" integer, "mime_type" character varying(100), "expiry_date" date, "is_verified" boolean NOT NULL DEFAULT false, "verified_at" TIMESTAMP WITH TIME ZONE, "verified_by" uuid, "rejection_reason" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_b6aa864f4d6f4a283445266a4dc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_218ad2aece37d1c3bf7cfe6c72" ON "vendor_documents" ("vendor_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "vendor_bank_accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "vendor_id" uuid NOT NULL, "account_holder_name" character varying(255) NOT NULL, "bank_name" character varying(255) NOT NULL, "account_number_encrypted" character varying(512) NOT NULL, "iban_encrypted" character varying(512), "swift_code" character varying(20), "routing_number" character varying(50), "currency" character(3) NOT NULL DEFAULT 'AED', "is_primary" boolean NOT NULL DEFAULT false, "is_verified" boolean NOT NULL DEFAULT false, "verified_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_737114e245e303e951b7cc3f0c9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_94e674d49212d992777ba20b8f" ON "vendor_bank_accounts" ("vendor_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "vendor_translations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "vendor_id" uuid NOT NULL, "locale" character varying(10) NOT NULL, "name" character varying(255) NOT NULL, "description" text, "return_policy" text, "shipping_policy" text, "meta_title" character varying(255), "meta_description" character varying(500), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_b0c30461cc843d95528e889e41c" UNIQUE ("vendor_id", "locale"), CONSTRAINT "PK_7b8aa98c0c3d01d46a5cf55b85a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_be516cd138f3a6318fb7b17ddd" ON "vendor_translations" ("vendor_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "vendor_followers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "vendor_id" uuid NOT NULL, "user_id" uuid NOT NULL, "followed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_3acdb5184cf99505d1fba01427d" UNIQUE ("vendor_id", "user_id"), CONSTRAINT "PK_962cc3ca8dd840ca609a0c60099" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0cf0b8f1c9b56d545899636919" ON "vendor_followers" ("vendor_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9fd05625f8610fd308f072cba2" ON "vendor_followers" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."vendor_integrations_inventory_authority_enum" AS ENUM('authoritative', 'advisory')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."vendor_integrations_pricing_authority_enum" AS ENUM('authoritative', 'advisory')`,
    );
    await queryRunner.query(
      `CREATE TABLE "vendor_integrations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "vendor_id" uuid NOT NULL, "name" character varying(255) NOT NULL, "outbound_url" text, "outbound_secret_encrypted" text, "outbound_previous_secret_encrypted" text, "outbound_secret_rotated_at" TIMESTAMP WITH TIME ZONE, "inbound_secret_encrypted" text, "inbound_secret_last4" character varying(8), "inbound_ip_allowlist" text array NOT NULL DEFAULT '{}', "inventory_authority" "public"."vendor_integrations_inventory_authority_enum" NOT NULL DEFAULT 'advisory', "pricing_authority" "public"."vendor_integrations_pricing_authority_enum" NOT NULL DEFAULT 'advisory', "is_active" boolean NOT NULL DEFAULT true, "degraded_until" TIMESTAMP WITH TIME ZONE, "last_outbound_success_at" TIMESTAMP WITH TIME ZONE, "last_inbound_success_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_ea2aa03199e11003291f2b824b8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "vendor_integrations_active_uq" ON "vendor_integrations" ("vendor_id") WHERE is_active = true AND deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."vendor_integration_mappings_event_type_enum" AS ENUM('vendor_order.created', 'vendor_order.status_changed', 'shipment.created', 'shipment.status_changed', 'order.accept', 'order.reject', 'shipment.create', 'shipment.update_status', 'inventory.adjust', 'product.update_price', 'product.update_attribute')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."vendor_integration_mappings_direction_enum" AS ENUM('outbound', 'inbound')`,
    );
    await queryRunner.query(
      `CREATE TABLE "vendor_integration_mappings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "integration_id" uuid NOT NULL, "event_type" "public"."vendor_integration_mappings_event_type_enum" NOT NULL, "direction" "public"."vendor_integration_mappings_direction_enum" NOT NULL, "spec" jsonb NOT NULL, "is_enabled" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_fd236122d13c7bc5d0100e4cb5a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "vendor_integration_mappings_uq" ON "vendor_integration_mappings" ("integration_id", "event_type", "direction") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."vendor_integration_deliveries_event_type_enum" AS ENUM('vendor_order.created', 'vendor_order.status_changed', 'shipment.created', 'shipment.status_changed', 'order.accept', 'order.reject', 'shipment.create', 'shipment.update_status', 'inventory.adjust', 'product.update_price', 'product.update_attribute')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."vendor_integration_deliveries_direction_enum" AS ENUM('outbound', 'inbound')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."vendor_integration_deliveries_status_enum" AS ENUM('pending', 'delivered', 'failed', 'dlq', 'skipped')`,
    );
    await queryRunner.query(
      `CREATE TABLE "vendor_integration_deliveries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "integration_id" uuid NOT NULL, "event_type" "public"."vendor_integration_deliveries_event_type_enum" NOT NULL, "direction" "public"."vendor_integration_deliveries_direction_enum" NOT NULL, "source_ref" jsonb, "idempotency_key" character varying(128), "request_body" jsonb, "request_headers" jsonb, "response_status" integer, "response_body" text, "latency_ms" integer NOT NULL DEFAULT '0', "attempt" smallint NOT NULL DEFAULT '1', "status" "public"."vendor_integration_deliveries_status_enum" NOT NULL DEFAULT 'pending', "error_message" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_9ea8ab78599711ff6a0303db04c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "vid_idempotency_uq" ON "vendor_integration_deliveries" ("idempotency_key", "integration_id") WHERE idempotency_key IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "vid_integration_created_idx" ON "vendor_integration_deliveries" ("integration_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "vendor_integration_pending_writes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "integration_id" uuid NOT NULL, "delivery_id" uuid NOT NULL, "kind" character varying(32) NOT NULL, "payload" jsonb NOT NULL, "status" character varying(16) NOT NULL DEFAULT 'pending', "auto_apply_threshold_breached" boolean NOT NULL DEFAULT false, "reviewed_by" uuid, "reviewed_at" TIMESTAMP WITH TIME ZONE, "applied_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_cd196bdfe2f21baeef4030c59e2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "vipw_status_idx" ON "vendor_integration_pending_writes" ("integration_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."vendor_members_role_enum" AS ENUM('owner', 'manager', 'staff', 'viewer')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."vendor_members_status_enum" AS ENUM('pending', 'active', 'revoked')`,
    );
    await queryRunner.query(
      `CREATE TABLE "vendor_members" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "vendor_id" uuid NOT NULL, "user_id" uuid, "email" character varying(255) NOT NULL, "role" "public"."vendor_members_role_enum" NOT NULL, "status" "public"."vendor_members_status_enum" NOT NULL DEFAULT 'pending', "invite_token" character varying(64), "invite_expires_at" TIMESTAMP WITH TIME ZONE, "invited_by_user_id" uuid, "accepted_at" TIMESTAMP WITH TIME ZONE, "revoked_at" TIMESTAMP WITH TIME ZONE, "revoked_by_user_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_df4f5fd5f54daefe49e9b0a90c8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d0d3b6ba9896e44104938d7c70" ON "vendor_members" ("vendor_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."role_permissions_role_enum" AS ENUM('owner', 'manager', 'staff', 'viewer')`,
    );
    await queryRunner.query(
      `CREATE TABLE "role_permissions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "role" "public"."role_permissions_role_enum" NOT NULL, "permission" character varying(64) NOT NULL, "updated_by_user_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_9c116ac03805ca80baf3e8d2319" UNIQUE ("role", "permission"), CONSTRAINT "PK_84059017c90bfcb701b8fa42297" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "parent_id" uuid, "name" character varying(255) NOT NULL, "slug" character varying(255) NOT NULL, "description" text, "image_url" character varying(1024), "icon_url" character varying(1024), "banner_url" character varying(1024), "is_active" boolean NOT NULL DEFAULT true, "is_featured" boolean NOT NULL DEFAULT false, "sort_order" integer NOT NULL DEFAULT '0', "commission_rate" numeric(5,2), "meta_title" character varying(255), "meta_description" character varying(500), "meta_keywords" character varying(500), "path" text, "depth" smallint NOT NULL DEFAULT '0', "product_count" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_420d9f679d41281f282f5bc7d09" UNIQUE ("slug"), CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_61720ee48ef901a7a228b06b04" ON "categories" ("slug") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "category_translations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "category_id" uuid NOT NULL, "locale" character varying(10) NOT NULL, "name" character varying(255) NOT NULL, "description" text, "meta_title" character varying(255), "meta_description" character varying(500), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_0e9b8be8a7526b1726dfb8f83ef" UNIQUE ("category_id", "locale"), CONSTRAINT "PK_9dff018a4a26a924c60d3e86432" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."attributes_type_enum" AS ENUM('text', 'number', 'boolean', 'select', 'multi_select', 'color', 'date')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."attributes_filter_input_type_enum" AS ENUM('checkbox', 'color_swatch', 'radio', 'range', 'toggle')`,
    );
    await queryRunner.query(
      `CREATE TABLE "attributes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(100) NOT NULL, "slug" character varying(100) NOT NULL, "type" "public"."attributes_type_enum" NOT NULL, "is_filterable" boolean NOT NULL DEFAULT true, "is_searchable" boolean NOT NULL DEFAULT false, "is_required" boolean NOT NULL DEFAULT false, "is_variant" boolean NOT NULL DEFAULT false, "is_groupable" boolean NOT NULL DEFAULT false, "filter_input_type" "public"."attributes_filter_input_type_enum", "sort_order" smallint NOT NULL DEFAULT '0', "validation" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_8723dbad2f74effbdc23b056205" UNIQUE ("slug"), CONSTRAINT "PK_32216e2e61830211d3a5d7fa72c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_088ed3a4aaabe23a6bca1d3290" ON "attributes" ("slug") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "attribute_translations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "attribute_id" uuid NOT NULL, "locale" character varying(10) NOT NULL, "name" character varying(100) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_af4fc1f62ab4042ef6003d2a2bc" UNIQUE ("attribute_id", "locale"), CONSTRAINT "PK_f268d77b7d7165103775ffae299" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "attribute_values" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "attribute_id" uuid NOT NULL, "value" character varying(100) NOT NULL, "slug" character varying(100) NOT NULL, "display_value" character varying(100), "color_hex" character(7), "swatch_image_url" character varying(1024), "sort_order" smallint NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_ca0ab5347af76c5ff512db5fbbd" UNIQUE ("attribute_id", "slug"), CONSTRAINT "PK_3babf93d1842d73e7ba849c0160" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "attribute_value_translations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "attribute_value_id" uuid NOT NULL, "locale" character varying(10) NOT NULL, "value" character varying(100) NOT NULL, "display_value" character varying(100), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_bd1838dce4deaf3604bdb6ecaff" UNIQUE ("attribute_value_id", "locale"), CONSTRAINT "PK_0ea27373179916cc2a2d63b7e10" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "category_attributes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "category_id" uuid NOT NULL, "attribute_id" uuid NOT NULL, "is_required" boolean NOT NULL DEFAULT false, "sort_order" smallint NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_e135f7d323a2899937cd2a2cb7b" UNIQUE ("category_id", "attribute_id"), CONSTRAINT "PK_f58b128e30a1ad029b32fb79624" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."brands_status_enum" AS ENUM('pending', 'approved', 'rejected')`,
    );
    await queryRunner.query(
      `CREATE TABLE "brands" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(255) NOT NULL, "slug" character varying(255) NOT NULL, "logo_url" character varying(1024), "description" text, "website_url" character varying(512), "is_active" boolean NOT NULL DEFAULT true, "is_featured" boolean NOT NULL DEFAULT false, "sort_order" integer NOT NULL DEFAULT '0', "meta_title" character varying(255), "meta_description" character varying(500), "product_count" integer NOT NULL DEFAULT '0', "status" "public"."brands_status_enum" NOT NULL DEFAULT 'approved', "submitted_by_vendor_id" uuid, "submitted_at" TIMESTAMP WITH TIME ZONE, "reviewed_by_user_id" uuid, "reviewed_at" TIMESTAMP WITH TIME ZONE, "rejection_reason" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_b15428f362be2200922952dc268" UNIQUE ("slug"), CONSTRAINT "PK_b0c437120b624da1034a81fc561" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_22b36048ad23b21bab6966008b" ON "brands" ("slug") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6e84db132e36cfff216facdba7" ON "brands" ("status") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "brand_translations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "brand_id" uuid NOT NULL, "locale" character varying(10) NOT NULL, "name" character varying(255) NOT NULL, "description" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_c6527d600d81230be64bcf94f9d" UNIQUE ("brand_id", "locale"), CONSTRAINT "PK_cea5b0039a8925041c380ee1302" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."products_status_enum" AS ENUM('draft', 'pending_review', 'approved', 'rejected', 'published', 'unpublished', 'archived')`,
    );
    await queryRunner.query(
      `CREATE TABLE "products" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "vendor_id" uuid NOT NULL, "category_id" uuid NOT NULL, "brand_id" uuid, "name" character varying(255) NOT NULL, "slug" character varying(255) NOT NULL, "short_description" text, "description" text, "rich_description" jsonb, "editorial" jsonb, "ingredients" text, "usage_instructions" text, "price" integer NOT NULL, "compare_at_price" integer, "cost_price" integer, "currency" character(3) NOT NULL DEFAULT 'AED', "price_overrides" jsonb, "is_vat_inclusive" boolean NOT NULL DEFAULT false, "tax_rate_id" uuid, "status" "public"."products_status_enum" NOT NULL DEFAULT 'draft', "published_at" TIMESTAMP WITH TIME ZONE, "reviewed_at" TIMESTAMP WITH TIME ZONE, "reviewed_by" uuid, "rejection_reason" text, "weight_grams" integer, "dimensions_cm" jsonb, "sku" character varying(50), "external_id" character varying(128), "barcode" character varying(50), "mpn" character varying(50), "country_of_origin" character(2), "is_featured" boolean NOT NULL DEFAULT false, "is_digital" boolean NOT NULL DEFAULT false, "is_customizable" boolean NOT NULL DEFAULT false, "requires_shipping" boolean NOT NULL DEFAULT true, "is_age_restricted" boolean NOT NULL DEFAULT false, "minimum_age" smallint, "track_inventory" boolean NOT NULL DEFAULT true, "allow_backorder" boolean NOT NULL DEFAULT false, "has_variants" boolean NOT NULL DEFAULT false, "rating_avg" numeric(3,2) NOT NULL DEFAULT '0', "rating_count" integer NOT NULL DEFAULT '0', "view_count" integer NOT NULL DEFAULT '0', "sales_count" integer NOT NULL DEFAULT '0', "wishlist_count" integer NOT NULL DEFAULT '0', "tags" text array, "attributes" jsonb, "meta_title" character varying(255), "meta_description" text, "meta_keywords" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_464f927ae360106b783ed0b4106" UNIQUE ("slug"), CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_f397896d12122c7d973f569449" ON "products" ("slug") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "product_translations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "product_id" uuid NOT NULL, "locale" character varying(10) NOT NULL, "name" character varying(255) NOT NULL, "short_description" text, "description" text, "rich_description" jsonb, "ingredients" text, "usage_instructions" text, "meta_title" character varying(255), "meta_description" character varying(500), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_431218829bc5c5ec9230232b960" UNIQUE ("product_id", "locale"), CONSTRAINT "PK_38feaa5884a6a0171d067cc9d15" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "product_categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "product_id" uuid NOT NULL, "category_id" uuid NOT NULL, "is_primary" boolean NOT NULL DEFAULT false, "sort_order" smallint NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_54f2e1dbf14cfa770f59f0aac8f" UNIQUE ("product_id", "category_id"), CONSTRAINT "PK_7069dac60d88408eca56fdc9e0c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "product_images" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "product_id" uuid NOT NULL, "variant_id" uuid, "url" character varying(1024) NOT NULL, "thumbnail_url" character varying(1024), "card_url" character varying(1024), "focal_x" numeric(4,3), "focal_y" numeric(4,3), "ai_source_image_id" uuid, "medium_url" character varying(1024), "alt_text" character varying(255), "is_primary" boolean NOT NULL DEFAULT false, "sort_order" smallint NOT NULL DEFAULT '0', "width" integer, "height" integer, "mime_type" character varying(50), "file_size" integer, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_1974264ea7265989af8392f63a1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "product_videos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "product_id" uuid, "asset_type" character varying(32) NOT NULL DEFAULT 'product', "vendor_id" uuid, "variant_id" uuid, "url" character varying(1024) NOT NULL, "webm_url" character varying(1024), "poster_url" character varying(1024) NOT NULL, "duration_seconds" smallint NOT NULL, "width" integer, "height" integer, "file_size" integer, "sort_order" smallint NOT NULL DEFAULT '0', "mime_type" character varying(50), "status" character varying(16) NOT NULL DEFAULT 'processing', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_705a4fd6bc408b0a8a874f09d7a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "product_variants" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "product_id" uuid NOT NULL, "name" character varying(255) NOT NULL, "sku" character varying(100), "external_id" character varying(128), "barcode" character varying(50), "option_values" jsonb NOT NULL, "price" integer NOT NULL, "compare_at_price" integer, "cost_price" integer, "price_overrides" jsonb, "weight_grams" integer, "dimensions_cm" jsonb, "is_active" boolean NOT NULL DEFAULT true, "sort_order" smallint NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_281e3f2c55652d6a22c0aa59fd7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."product_groups_listing_mode_enum" AS ENUM('collapsed', 'individual')`,
    );
    await queryRunner.query(
      `CREATE TABLE "product_groups" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "vendor_id" uuid NOT NULL, "category_id" uuid, "name" character varying(255) NOT NULL, "grouping_attribute_id" uuid NOT NULL, "listing_mode" "public"."product_groups_listing_mode_enum" NOT NULL DEFAULT 'collapsed', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_bccc8805f3453d0cce77c1beedb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "product_group_members" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "group_id" uuid NOT NULL, "product_id" uuid NOT NULL, "attribute_value_id" uuid NOT NULL, "is_primary" boolean NOT NULL DEFAULT false, "sort_order" smallint NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_46a89495e166798d19798679970" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "warehouses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "vendor_id" uuid, "name" character varying(255) NOT NULL, "code" character varying(50) NOT NULL, "address_line_1" character varying(255) NOT NULL, "address_line_2" character varying(255), "city" character varying(100) NOT NULL, "emirate" character varying(50) NOT NULL, "country_code" character(2) NOT NULL DEFAULT 'AE', "latitude" numeric(10,7), "longitude" numeric(10,7), "zone_id" uuid, "is_active" boolean NOT NULL DEFAULT true, "is_default" boolean NOT NULL DEFAULT false, "operating_hours" jsonb, "contact_phone" character varying(20), "contact_email" character varying(255), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_56ae21ee2432b2270b48867e4be" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_5700614c802ce8826767c27879" ON "warehouses" ("code") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "warehouse_vendor_permissions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "warehouse_id" uuid NOT NULL, "vendor_id" uuid NOT NULL, "permission" character varying(64) NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "granted_by_user_id" uuid, "reason" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_7a130fc374773161b22536162f7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_warehouse_vendor_permissions_active" ON "warehouse_vendor_permissions" ("warehouse_id", "vendor_id", "permission") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "inventory" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "product_id" uuid NOT NULL, "variant_id" uuid, "vendor_id" uuid NOT NULL, "warehouse_id" uuid, "quantity_on_hand" integer NOT NULL DEFAULT '0', "quantity_reserved" integer NOT NULL DEFAULT '0', "quantity_available" integer NOT NULL DEFAULT '0', "low_stock_threshold" integer NOT NULL DEFAULT '5', "reorder_point" integer, "max_stock_level" integer, "last_restocked_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_82aa5da437c5bbfb80703b08309" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_inventory_product_variant_warehouse_active" ON "inventory" ("product_id", "variant_id", "warehouse_id") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "inventory_movements" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "inventory_id" uuid NOT NULL, "product_id" uuid NOT NULL, "variant_id" uuid, "quantity" integer NOT NULL, "quantity_before" integer NOT NULL, "quantity_after" integer NOT NULL, "movement_type" character varying(50) NOT NULL, "reference_type" character varying(50), "reference_id" uuid, "notes" text, "created_by" uuid, "external_change_id" character varying(128), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_d7597827c1dcffae889db3ab873" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."inventory_reservations_status_enum" AS ENUM('active', 'committed', 'released', 'expired')`,
    );
    await queryRunner.query(
      `CREATE TABLE "inventory_reservations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "inventory_id" uuid NOT NULL, "order_id" uuid, "cart_id" uuid, "quantity" integer NOT NULL, "status" "public"."inventory_reservations_status_enum" NOT NULL DEFAULT 'active', "reserved_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(), "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "committed_at" TIMESTAMP WITH TIME ZONE, "released_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_af438c0ce596eea6c4d472a0489" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "product_attribute_values" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "product_id" uuid NOT NULL, "variant_id" uuid, "attribute_id" uuid NOT NULL, "attribute_value_id" uuid, "text_value" character varying(500), "is_visible" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_b124baf1272037deac1c21cffe1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "wishlists" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid, "guest_session_id" uuid, "product_id" uuid NOT NULL, "variant_id" uuid, "added_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_d0a37f2848c5d268d315325f359" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "carts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid, "guest_session_id" uuid, "coupon_id" uuid, "coupon_code" character varying(50), "affiliate_code" character varying(50), "coupon_discount" integer NOT NULL DEFAULT '0', "subtotal" integer NOT NULL DEFAULT '0', "currency" character(3) NOT NULL DEFAULT 'AED', "item_count" integer NOT NULL DEFAULT '0', "last_activity_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(), "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_b5f695a59f5ebb50af3c8160816" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "cart_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "cart_id" uuid NOT NULL, "product_id" uuid NOT NULL, "variant_id" uuid, "vendor_id" uuid NOT NULL, "quantity" integer NOT NULL DEFAULT '1', "unit_price" integer NOT NULL, "compare_at_price" integer, "flash_deal_id" uuid, "original_unit_price" integer, "line_total" integer NOT NULL, "customization_data" jsonb, "added_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_a1cad8f92c2ad2338f820fa2f90" UNIQUE ("cart_id", "product_id", "variant_id"), CONSTRAINT "PK_6fccf5ec03c172d27a28a82928b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."product_relations_type_enum" AS ENUM('related', 'cross_sell', 'upsell', 'frequently_bought_together')`,
    );
    await queryRunner.query(
      `CREATE TABLE "product_relations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "product_id" uuid NOT NULL, "related_product_id" uuid NOT NULL, "type" "public"."product_relations_type_enum" NOT NULL, "sort_order" smallint NOT NULL DEFAULT '0', "is_auto" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_ee58f4788f86b7c3b2269e69c1d" UNIQUE ("product_id", "related_product_id", "type"), CONSTRAINT "PK_fba7297af4d3a79b8e511777439" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "product_bundles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "product_id" uuid NOT NULL, "name" character varying(255) NOT NULL, "bundle_price" integer NOT NULL, "compare_at_price" integer, "discount_percentage" numeric(5,2), "min_quantity" integer NOT NULL DEFAULT '1', "max_quantity" integer, "is_active" boolean NOT NULL DEFAULT true, "starts_at" TIMESTAMP WITH TIME ZONE, "expires_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_90176621a4e93cc30e1f5b2077b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "bundle_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "bundle_id" uuid NOT NULL, "product_id" uuid NOT NULL, "variant_id" uuid, "quantity" integer NOT NULL DEFAULT '1', "sort_order" smallint NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_8827da42f548eaa3f0bc5a0d423" UNIQUE ("bundle_id", "product_id", "variant_id"), CONSTRAINT "PK_a455144e23de2139ebeb3461e83" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "product_questions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "product_id" uuid NOT NULL, "user_id" uuid NOT NULL, "question" text NOT NULL, "answer" text, "answered_by" uuid, "answered_at" TIMESTAMP WITH TIME ZONE, "is_published" boolean NOT NULL DEFAULT false, "upvote_count" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_f4661bdf08fa5d9fecd2ed93049" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "price_history" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "product_id" uuid NOT NULL, "variant_id" uuid, "old_price" integer NOT NULL, "new_price" integer NOT NULL, "old_compare_at_price" integer, "new_compare_at_price" integer, "currency" character(3) NOT NULL DEFAULT 'AED', "changed_by" uuid, "change_reason" character varying(255), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_e41e25472373d4b574b153229e9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."orders_status_enum" AS ENUM('draft', 'pending_payment', 'payment_failed', 'confirmed', 'processing', 'ready_to_ship', 'shipped', 'out_for_delivery', 'delivered', 'partially_shipped', 'partially_delivered', 'cancelled', 'refund_requested', 'refunded', 'partially_refunded', 'disputed')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."orders_payment_status_enum" AS ENUM('pending', 'authorized', 'captured', 'failed', 'refunded', 'partially_refunded', 'chargeback', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TABLE "orders" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "order_number" character varying(30) NOT NULL, "user_id" uuid NOT NULL, "status" "public"."orders_status_enum" NOT NULL DEFAULT 'pending_payment', "payment_status" "public"."orders_payment_status_enum" NOT NULL DEFAULT 'pending', "subtotal" integer NOT NULL, "discount_total" integer NOT NULL DEFAULT '0', "shipping_total" integer NOT NULL DEFAULT '0', "surcharge_total" integer NOT NULL DEFAULT '0', "tax_total" integer NOT NULL DEFAULT '0', "grand_total" integer NOT NULL, "refund_total" integer NOT NULL DEFAULT '0', "invoice_s3_key" character varying(1024), "invoice_generated_at" TIMESTAMP WITH TIME ZONE, "invoice_last_error" text, "currency" character(3) NOT NULL DEFAULT 'AED', "exchange_rate" numeric(12,6) NOT NULL DEFAULT '1', "base_currency" character(3) NOT NULL DEFAULT 'AED', "coupon_id" uuid, "coupon_code" character varying(50), "coupon_discount" integer NOT NULL DEFAULT '0', "shipping_address" jsonb NOT NULL, "billing_address" jsonb, "shipping_method" character varying(100), "expected_delivery_date" date, "delivered_at" TIMESTAMP WITH TIME ZONE, "customer_notes" text, "admin_notes" text, "channel" character varying(50), "ip_address" character varying(45), "user_agent" character varying(512), "attribution" jsonb, "is_test_order" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_75eba1c6b1a66b09f2a97e6927b" UNIQUE ("order_number"), CONSTRAINT "PK_710e2d4957aa5878dfe94e4ac2f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_235d1d1767c7d286e38859f499" ON "orders" ("order_number") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."vendor_orders_status_enum" AS ENUM('draft', 'pending_payment', 'payment_failed', 'confirmed', 'processing', 'ready_to_ship', 'shipped', 'out_for_delivery', 'delivered', 'partially_shipped', 'partially_delivered', 'cancelled', 'refund_requested', 'refunded', 'partially_refunded', 'disputed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "vendor_orders" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "order_id" uuid NOT NULL, "vendor_id" uuid NOT NULL, "vendor_order_number" character varying(30) NOT NULL, "status" "public"."vendor_orders_status_enum" NOT NULL DEFAULT 'confirmed', "delivered_at" TIMESTAMP WITH TIME ZONE, "subtotal" integer NOT NULL, "shipping_cost" integer NOT NULL DEFAULT '0', "carrier_cost" integer NOT NULL DEFAULT '0', "shipping_contribution" integer NOT NULL DEFAULT '0', "tax_total" integer NOT NULL DEFAULT '0', "vendor_total" integer NOT NULL, "currency" character(3) NOT NULL DEFAULT 'AED', "exchange_rate" numeric(12,6) NOT NULL DEFAULT '1', "warehouse_id" uuid, "processing_deadline" TIMESTAMP WITH TIME ZONE, "vendor_notes" text, "accepted_at" TIMESTAMP WITH TIME ZONE, "rejected_at" TIMESTAMP WITH TIME ZONE, "rejection_reason" text, "booking_error" text, "received_at_hub_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_42baacb0d2313a3cfa5db9ff112" UNIQUE ("vendor_order_number"), CONSTRAINT "PK_7abcbaa3930fd9d95675e967de9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_7aedded21669e72423d3e88b94" ON "vendor_orders" ("vendor_order_number") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."order_items_status_enum" AS ENUM('draft', 'pending_payment', 'payment_failed', 'confirmed', 'processing', 'ready_to_ship', 'shipped', 'out_for_delivery', 'delivered', 'partially_shipped', 'partially_delivered', 'cancelled', 'refund_requested', 'refunded', 'partially_refunded', 'disputed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "order_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "order_id" uuid NOT NULL, "vendor_order_id" uuid NOT NULL, "vendor_id" uuid NOT NULL, "product_id" uuid NOT NULL, "variant_id" uuid, "product_name" character varying(255) NOT NULL, "variant_name" character varying(255), "product_sku" character varying(100), "external_id" character varying(128), "product_image_url" character varying(1024), "product_snapshot" jsonb, "quantity" integer NOT NULL, "unit_price" integer NOT NULL, "compare_at_price" integer, "discount_amount" integer NOT NULL DEFAULT '0', "tax_amount" integer NOT NULL DEFAULT '0', "tax_rate" numeric(5,2) NOT NULL DEFAULT '5', "line_total" integer NOT NULL, "refunded_quantity" integer NOT NULL DEFAULT '0', "refunded_amount" integer NOT NULL DEFAULT '0', "is_reviewed" boolean NOT NULL DEFAULT false, "status" "public"."order_items_status_enum" NOT NULL DEFAULT 'confirmed', "customization_data" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_005269d8574e6fac0493715c308" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "order_status_history" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "order_id" uuid NOT NULL, "vendor_order_id" uuid, "order_item_id" uuid, "from_status" character varying(50), "to_status" character varying(50) NOT NULL, "comment" text, "is_customer_visible" boolean NOT NULL DEFAULT true, "changed_by" uuid, "changed_by_role" character varying(50), "metadata" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_e6c66d853f155531985fc4f6ec8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "order_item_cancellations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "order_id" uuid NOT NULL, "admin_id" uuid NOT NULL, "reason" text NOT NULL, "refund_amount" integer NOT NULL, "currency" character(3) NOT NULL DEFAULT 'AED', "refund_method" character varying(30) NOT NULL, "gateway_refund_id" character varying(255), "status" character varying(20) NOT NULL DEFAULT 'completed', "items" jsonb NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_f6d696ba34ca9ab052d652d54b4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_10a14db799cf39d34c99b93685" ON "order_item_cancellations" ("created_at") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."shipments_status_enum" AS ENUM('pending', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'cancelled', 'failed_delivery', 'returned')`,
    );
    await queryRunner.query(
      `CREATE TABLE "shipments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "order_id" uuid NOT NULL, "vendor_order_id" uuid NOT NULL, "vendor_id" uuid NOT NULL, "warehouse_id" uuid, "tracking_number" character varying(100), "external_shipment_id" character varying(255), "carrier" character varying(100), "carrier_service" character varying(100), "tracking_url" character varying(1024), "label_url" character varying(1024), "pickup_code" character varying(100), "status" "public"."shipments_status_enum" NOT NULL DEFAULT 'pending', "shipped_at" TIMESTAMP WITH TIME ZONE, "estimated_delivery_at" TIMESTAMP WITH TIME ZONE, "delivered_at" TIMESTAMP WITH TIME ZONE, "weight_grams" integer, "shipping_cost" integer, "carrier_cost_fils" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_6deda4532ac542a93eab214b564" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."shipment_events_status_enum" AS ENUM('pending', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'cancelled', 'failed_delivery', 'returned')`,
    );
    await queryRunner.query(
      `CREATE TABLE "shipment_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "shipment_id" uuid NOT NULL, "status" "public"."shipment_events_status_enum" NOT NULL, "location" character varying(255), "description" text, "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL, "raw_payload" jsonb, "external_event_id" character varying(255), "provider_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_80a42a8d00d59cbfab38e1d0872" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "shipment_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "shipment_id" uuid NOT NULL, "order_item_id" uuid NOT NULL, "quantity" integer NOT NULL, "is_delivered" boolean NOT NULL DEFAULT false, "delivered_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_eba891e0f8bf1507136e240ea44" UNIQUE ("shipment_id", "order_item_id"), CONSTRAINT "PK_7dfc873be1417190f0e5e001dd3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."shipment_status_history_from_status_enum" AS ENUM('pending', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'cancelled', 'failed_delivery', 'returned')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."shipment_status_history_to_status_enum" AS ENUM('pending', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'cancelled', 'failed_delivery', 'returned')`,
    );
    await queryRunner.query(
      `CREATE TABLE "shipment_status_history" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "shipment_id" uuid NOT NULL, "vendor_order_id" uuid NOT NULL, "from_status" "public"."shipment_status_history_from_status_enum" NOT NULL, "to_status" "public"."shipment_status_history_to_status_enum" NOT NULL, "changed_by" uuid, "changed_by_role" character varying(50) NOT NULL, "is_customer_visible" boolean NOT NULL DEFAULT false, "reason" text, "metadata" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ed8735b581a68c1c5a84b6121da" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."returns_status_enum" AS ENUM('requested', 'approved', 'rejected', 'shipped_back', 'received', 'refunded', 'closed')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."returns_reason_enum" AS ENUM('defective', 'wrong_item', 'not_as_described', 'changed_mind', 'arrived_late', 'other')`,
    );
    await queryRunner.query(
      `CREATE TABLE "returns" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "return_number" character varying(30) NOT NULL, "order_id" uuid NOT NULL, "vendor_order_id" uuid NOT NULL, "user_id" uuid NOT NULL, "vendor_id" uuid NOT NULL, "status" "public"."returns_status_enum" NOT NULL DEFAULT 'requested', "reason" "public"."returns_reason_enum" NOT NULL, "reason_details" text, "media_urls" jsonb NOT NULL DEFAULT '[]', "return_shipping_carrier" character varying(100), "return_tracking_number" character varying(100), "return_shipping_cost" integer, "return_shipping_paid_by" character varying(20), "refund_amount" integer, "refund_method" character varying(50), "refunded_at" TIMESTAMP WITH TIME ZONE, "approved_at" TIMESTAMP WITH TIME ZONE, "approved_by" uuid, "rejected_at" TIMESTAMP WITH TIME ZONE, "rejection_reason" text, "received_at" TIMESTAMP WITH TIME ZONE, "restocked" boolean NOT NULL DEFAULT false, "admin_notes" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_df468a204fb304989cea982f204" UNIQUE ("return_number"), CONSTRAINT "PK_27a2f1895a71519ebfec7850361" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_1a49224595b601bf4b9328cd9e" ON "returns" ("return_number") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."return_items_reason_enum" AS ENUM('defective', 'wrong_item', 'not_as_described', 'changed_mind', 'arrived_late', 'other')`,
    );
    await queryRunner.query(
      `CREATE TABLE "return_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "return_id" uuid NOT NULL, "order_item_id" uuid NOT NULL, "quantity" integer NOT NULL, "reason" "public"."return_items_reason_enum" NOT NULL, "condition" character varying(50), "refund_amount" integer, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_6e6c1db00d31ab59c1bc22f6cb9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."disputes_status_enum" AS ENUM('opened', 'under_review', 'escalated', 'resolved_buyer', 'resolved_seller', 'closed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "disputes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "dispute_number" character varying(30) NOT NULL, "order_id" uuid NOT NULL, "vendor_order_id" uuid, "opened_by" uuid NOT NULL, "vendor_id" uuid NOT NULL, "assigned_to" uuid, "status" "public"."disputes_status_enum" NOT NULL DEFAULT 'opened', "category" character varying(100) NOT NULL, "description" text NOT NULL, "evidence_urls" jsonb NOT NULL DEFAULT '[]', "resolution" text, "resolution_amount" integer, "resolved_at" TIMESTAMP WITH TIME ZONE, "resolved_by" uuid, "escalated_at" TIMESTAMP WITH TIME ZONE, "deadline_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_c616fdacd3eb4fa0b216b9378b7" UNIQUE ("dispute_number"), CONSTRAINT "PK_3c97580d01c1a4b0b345c42a107" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_b2b0a876e8ca60365d9586efcc" ON "disputes" ("dispute_number") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "dispute_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "dispute_id" uuid NOT NULL, "sender_id" uuid NOT NULL, "sender_role" character varying(20) NOT NULL, "message" text NOT NULL, "attachment_urls" jsonb NOT NULL DEFAULT '[]', "is_internal" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_8826f78d556a1846f8cbad5ed05" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payments_status_enum" AS ENUM('pending', 'authorized', 'captured', 'failed', 'refunded', 'partially_refunded', 'chargeback', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payments_payment_method_enum" AS ENUM('credit_card', 'debit_card', 'paypal', 'stripe', 'bank_transfer', 'cash_on_delivery', 'wallet', 'crypto', 'tabby', 'tamara')`,
    );
    await queryRunner.query(
      `CREATE TABLE "payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "order_id" uuid, "booking_id" uuid, "user_id" uuid NOT NULL, "status" "public"."payments_status_enum" NOT NULL DEFAULT 'pending', "payment_method" "public"."payments_payment_method_enum" NOT NULL, "amount" integer NOT NULL, "currency" character(3) NOT NULL DEFAULT 'AED', "gateway" character varying(50) NOT NULL, "gateway_transaction_id" character varying(255), "gateway_payment_id" character varying(255), "gateway_order_id" character varying(255), "gateway_response" jsonb, "card_last4" character(4), "card_brand" character varying(20), "card_expiry" character varying(7), "refunded_amount" integer NOT NULL DEFAULT '0', "refund_reason" text, "refunded_at" TIMESTAMP WITH TIME ZONE, "authorized_at" TIMESTAMP WITH TIME ZONE, "captured_at" TIMESTAMP WITH TIME ZONE, "failed_at" TIMESTAMP WITH TIME ZONE, "failure_reason" text, "ip_address" character varying(45), "is_test" boolean NOT NULL DEFAULT false, "three_ds_status" character varying(50), "three_ds_redirect_url" character varying(1024), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."webhook_events_status_enum" AS ENUM('pending', 'processed', 'failed', 'skipped')`,
    );
    await queryRunner.query(
      `CREATE TABLE "webhook_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "gateway" character varying(50) NOT NULL, "event_type" character varying(100) NOT NULL, "event_id" character varying(255) NOT NULL, "payload" jsonb NOT NULL, "status" "public"."webhook_events_status_enum" NOT NULL DEFAULT 'pending', "processed_at" TIMESTAMP WITH TIME ZONE, "error_message" text, "attempts" smallint NOT NULL DEFAULT '0', "last_attempt_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_a1c947fff2f3407ed722a947855" UNIQUE ("gateway", "event_id"), CONSTRAINT "PK_4cba37e6a0acb5e1fc49c34ebfd" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "tax_rates" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(255) NOT NULL, "rate" numeric(5,2) NOT NULL, "country_code" character(2) NOT NULL DEFAULT 'AE', "emirate" character varying(50), "category_id" uuid, "zone_type" character varying(50), "is_default" boolean NOT NULL DEFAULT false, "effective_from" date NOT NULL, "effective_until" date, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_41164a748f3dafa373c7e508ca2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."commissions_commission_type_enum" AS ENUM('percentage', 'fixed', 'tiered')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."commissions_status_enum" AS ENUM('pending', 'held', 'approved', 'paid', 'disputed', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TABLE "commissions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "vendor_id" uuid NOT NULL, "order_id" uuid, "vendor_order_id" uuid, "order_item_id" uuid, "payout_id" uuid, "commission_type" "public"."commissions_commission_type_enum" NOT NULL, "commission_rate" numeric(8,4) NOT NULL, "item_total" integer NOT NULL, "commission_amount" integer NOT NULL, "tax_on_commission" integer NOT NULL DEFAULT '0', "vendor_earning" integer NOT NULL, "currency" character(3) NOT NULL DEFAULT 'AED', "status" "public"."commissions_status_enum" NOT NULL DEFAULT 'pending', "settle_after" TIMESTAMP WITH TIME ZONE, "approved_at" TIMESTAMP WITH TIME ZONE, "paid_at" TIMESTAMP WITH TIME ZONE, "adjustment_amount" integer NOT NULL DEFAULT '0', "adjustment_reason" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_2701379966e2e670bb5ff0ae78e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."vendor_payouts_status_enum" AS ENUM('pending', 'processing', 'paid', 'failed')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."vendor_payouts_payout_rail_enum" AS ENUM('manual_bank_transfer', 'stripe_connect')`,
    );
    await queryRunner.query(
      `CREATE TABLE "vendor_payouts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "vendor_id" uuid NOT NULL, "bank_account_id" uuid NOT NULL, "payout_reference" character varying(50) NOT NULL, "period_start" date NOT NULL, "period_end" date NOT NULL, "gross_amount" integer NOT NULL, "commission_total" integer NOT NULL, "adjustment_total" integer NOT NULL DEFAULT '0', "carrier_cost_total" integer NOT NULL DEFAULT '0', "shipping_contribution_total" integer NOT NULL DEFAULT '0', "net_amount" integer NOT NULL, "currency" character(3) NOT NULL DEFAULT 'AED', "status" "public"."vendor_payouts_status_enum" NOT NULL DEFAULT 'pending', "payout_rail" "public"."vendor_payouts_payout_rail_enum", "gateway_reference" character varying(255), "processed_at" TIMESTAMP WITH TIME ZONE, "notes" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_594843b57e27788bacc9d4e459c" UNIQUE ("payout_reference"), CONSTRAINT "PK_e74c8ca05043a7ae7cf20b4f59e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_dcddca06ee5d705e0aedb1d09b" ON "vendor_payouts" ("payout_reference") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "vendor_payout_adjustments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "vendor_id" uuid NOT NULL, "amount_fils" integer NOT NULL, "reason" character varying(255) NOT NULL, "source_type" character varying(50) NOT NULL, "source_id" uuid, "settled_payout_id" uuid, "created_by" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_e74cdae4251f0cd4577197d6d85" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fa6be81c82219a4d8fcb87d73c" ON "vendor_payout_adjustments" ("vendor_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "wallet_transactions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "amount" integer NOT NULL, "currency" character(3) NOT NULL DEFAULT 'AED', "balance_before" integer NOT NULL, "balance_after" integer NOT NULL, "transaction_type" character varying(50) NOT NULL, "order_id" uuid, "reference_type" character varying(50), "reference_id" uuid, "description" text, "expires_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_5120f131bde2cda940ec1a621db" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "payment_method_thresholds" ("provider" character varying(32) NOT NULL, "min_amount_fils" bigint NOT NULL, "max_amount_fils" bigint NOT NULL, "plans" jsonb NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "surcharge_fils" bigint, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_69dd08389057da10722f9d37a3d" PRIMARY KEY ("provider"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."reviews_status_enum" AS ENUM('pending', 'approved', 'rejected', 'flagged')`,
    );
    await queryRunner.query(
      `CREATE TABLE "reviews" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "product_id" uuid NOT NULL, "vendor_id" uuid NOT NULL, "user_id" uuid NOT NULL, "order_item_id" uuid NOT NULL, "variant_id" uuid, "rating" smallint NOT NULL, "title" character varying(255), "body" text, "media_urls" jsonb NOT NULL DEFAULT '[]', "status" "public"."reviews_status_enum" NOT NULL DEFAULT 'pending', "approved_at" TIMESTAMP WITH TIME ZONE, "approved_by" uuid, "rejection_reason" text, "vendor_reply" text, "vendor_replied_at" TIMESTAMP WITH TIME ZONE, "helpful_count" integer NOT NULL DEFAULT '0', "not_helpful_count" integer NOT NULL DEFAULT '0', "is_verified_purchase" boolean NOT NULL DEFAULT true, "is_featured" boolean NOT NULL DEFAULT false, "quality_rating" smallint, "value_rating" smallint, "shipping_rating" smallint, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_eb97a06e4fcd030190bd8155dae" UNIQUE ("order_item_id"), CONSTRAINT "PK_231ae565c273ee700b283f15c1d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_13f213a81d0dcf865e5a9306a1" ON "reviews" ("order_item_id") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "review_votes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "review_id" uuid NOT NULL, "user_id" uuid NOT NULL, "is_helpful" boolean NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_c29b2123b95900b6357477899a1" UNIQUE ("review_id", "user_id"), CONSTRAINT "PK_687569add3c5a70950438fa0cee" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."coupons_type_enum" AS ENUM('percentage', 'fixed_amount', 'free_shipping', 'buy_x_get_y')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."coupons_applicable_to_enum" AS ENUM('all', 'specific_products', 'specific_categories', 'specific_vendors', 'specific_collection')`,
    );
    await queryRunner.query(
      `CREATE TABLE "coupons" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" character varying(50) NOT NULL, "name" character varying(255) NOT NULL, "description" text, "type" "public"."coupons_type_enum" NOT NULL, "applicable_to" "public"."coupons_applicable_to_enum" NOT NULL DEFAULT 'all', "collection_id" uuid, "vendor_id" uuid, "discount_value" integer NOT NULL, "max_discount_amount" integer, "currency" character(3) NOT NULL DEFAULT 'AED', "minimum_order_amount" integer, "minimum_quantity" integer, "usage_limit" integer, "usage_limit_per_user" integer, "usage_count" integer NOT NULL DEFAULT '0', "starts_at" TIMESTAMP WITH TIME ZONE, "expires_at" TIMESTAMP WITH TIME ZONE, "is_active" boolean NOT NULL DEFAULT true, "is_single_use" boolean NOT NULL DEFAULT false, "is_public" boolean NOT NULL DEFAULT true, "buy_quantity" integer, "get_quantity" integer, "get_discount_percentage" numeric(5,2), "first_order_only" boolean NOT NULL DEFAULT false, "new_users_only" boolean NOT NULL DEFAULT false, "created_by" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_e025109230e82925843f2a14c48" UNIQUE ("code"), CONSTRAINT "PK_d7ea8864a0150183770f3e9a8cb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_59adfb33ba6cd163693d55828e" ON "coupons" ("code") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "coupon_products" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "coupon_id" uuid NOT NULL, "product_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_e37d7a9483f4414d61a3fd392ab" UNIQUE ("coupon_id", "product_id"), CONSTRAINT "PK_7890462e3f0e52ce4d550b4f450" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "coupon_categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "coupon_id" uuid NOT NULL, "category_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_dc4310e1d47f99b254a151b276f" UNIQUE ("coupon_id", "category_id"), CONSTRAINT "PK_c1b157daae026b041d327a049f9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "coupon_vendors" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "coupon_id" uuid NOT NULL, "vendor_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_ad58971fce3f42a0d46f6d84da2" UNIQUE ("coupon_id", "vendor_id"), CONSTRAINT "PK_244b963eef8344396ff3d4e5afe" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "coupon_excluded_products" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "coupon_id" uuid NOT NULL, "product_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_c02e5cad563daf2909e9535be5f" UNIQUE ("coupon_id", "product_id"), CONSTRAINT "PK_d1a29344d483c509d826540789b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "coupon_user_restrictions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "coupon_id" uuid NOT NULL, "user_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_f805a5d9adc19cbaa9369264c68" UNIQUE ("coupon_id", "user_id"), CONSTRAINT "PK_27d352ea67cc0e66b4b3354a631" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "coupon_usages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "coupon_id" uuid NOT NULL, "user_id" uuid NOT NULL, "order_id" uuid NOT NULL, "discount_applied" integer NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_f017af60a02209a6b045f673ca1" UNIQUE ("order_id"), CONSTRAINT "PK_01ff9a1cac559c4ae2e4179d0a3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_aa4489e0125b5e98527daab4e8" ON "coupon_usages" ("order_id") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."product_collections_kind_enum" AS ENUM('product', 'variant')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."product_collections_default_sort_enum" AS ENUM('custom', 'price_asc', 'price_desc', 'newest', 'rating')`,
    );
    await queryRunner.query(
      `CREATE TABLE "product_collections" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(255) NOT NULL, "slug" character varying(255) NOT NULL, "description" text, "kind" "public"."product_collections_kind_enum" NOT NULL DEFAULT 'product', "rules" jsonb, "default_sort" "public"."product_collections_default_sort_enum" NOT NULL DEFAULT 'custom', "max_products" integer, "starts_at" TIMESTAMP WITH TIME ZONE, "ends_at" TIMESTAMP WITH TIME ZONE, "is_active" boolean NOT NULL DEFAULT true, "created_by" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_b6e5d43167356236927d5ca64bb" UNIQUE ("slug"), CONSTRAINT "PK_32bc9e0d29551e755a4df9a5f4e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_effc3237374fb4159da228a299" ON "product_collections" ("slug") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."product_collection_items_role_enum" AS ENUM('pin', 'exclude')`,
    );
    await queryRunner.query(
      `CREATE TABLE "product_collection_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "collection_id" uuid NOT NULL, "product_id" uuid, "variant_id" uuid, "role" "public"."product_collection_items_role_enum" NOT NULL, "position" integer NOT NULL DEFAULT '0', "source_sku" character varying(100), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_a87760a897dafae1a7750b29434" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_1ddc65ebe1ca9b257bcc2db3d1" ON "product_collection_items" ("collection_id", "variant_id") WHERE deleted_at IS NULL AND variant_id IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_8819ef954194e70538422cb6d4" ON "product_collection_items" ("collection_id", "product_id") WHERE deleted_at IS NULL AND product_id IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_903616ff5ddd9908f81e070215" ON "product_collection_items" ("collection_id", "role", "position") `,
    );
    await queryRunner.query(
      `CREATE TABLE "product_collection_members" ("collection_id" uuid NOT NULL, "product_id" uuid NOT NULL, "refreshed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_2ceb4ae0a16c78e6040e97666fc" PRIMARY KEY ("collection_id", "product_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9dcf949717f80df916d4121b8c" ON "product_collection_members" ("product_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "delivery_zones" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(255) NOT NULL, "slug" character varying(255) NOT NULL, "city" character varying(100) NOT NULL, "emirate" character varying(50) NOT NULL, "country_code" character(2) NOT NULL DEFAULT 'AE', "is_active" boolean NOT NULL DEFAULT true, "sort_order" integer NOT NULL DEFAULT '0', "boundary" character varying, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_b1ce4fadbdaeaf4e4277ed795d7" UNIQUE ("slug"), CONSTRAINT "PK_88bc4c12be62436a61930cf34a9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_86836140df407cb2436f1e0fc3" ON "delivery_zones" ("slug") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "shipping_rates" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "vendor_id" uuid, "zone_id" uuid, "name" character varying(255) NOT NULL, "method" character varying(100) NOT NULL, "min_weight_grams" integer, "max_weight_grams" integer, "min_order_amount" integer, "carrier" character varying(100), "base_cost" integer NOT NULL, "carrier_cost" integer, "per_kg_cost" integer NOT NULL DEFAULT '0', "free_above" integer, "currency" character(3) NOT NULL DEFAULT 'AED', "estimated_days_min" smallint, "estimated_days_max" smallint, "is_active" boolean NOT NULL DEFAULT true, "sort_order" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_c97b830633433697b24df68885a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "shipping_contribution_tiers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "vendor_id" uuid, "min_order_value" integer NOT NULL, "vendor_contribution" integer NOT NULL, "currency" character(3) NOT NULL DEFAULT 'AED', "is_active" boolean NOT NULL DEFAULT true, "sort_order" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_64a18a84a510b6c14a93e5afc47" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "shipping_providers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" character varying(50) NOT NULL, "display_name" character varying(255) NOT NULL, "description" text, "logo_url" text, "credential_schema" jsonb NOT NULL, "supported_regions" text array NOT NULL DEFAULT '{}', "webhook_secret_encrypted" character varying(512), "is_active" boolean NOT NULL DEFAULT false, "sort_order" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_705e6ba7096df5ee910659e025d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "shipping_providers_code_uq" ON "shipping_providers" ("code") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "vendor_carrier_accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "vendor_id" uuid, "provider_id" uuid NOT NULL, "display_name" character varying(255) NOT NULL, "credentials_encrypted" text NOT NULL, "credentials_last4" character varying(8), "is_active" boolean NOT NULL DEFAULT true, "is_verified" boolean NOT NULL DEFAULT false, "verified_at" TIMESTAMP WITH TIME ZONE, "last_verify_error" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_d42d3aacc74c84e9396c94e49bd" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "vendor_carrier_accounts_platform_provider_uq" ON "vendor_carrier_accounts" ("provider_id") WHERE vendor_id IS NULL AND deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "vendor_carrier_accounts_vendor_provider_uq" ON "vendor_carrier_accounts" ("vendor_id", "provider_id") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "vendor_carrier_accounts_vendor_idx" ON "vendor_carrier_accounts" ("vendor_id") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "site_settings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "key" character varying(255) NOT NULL, "value" text NOT NULL, "value_type" character varying(20) NOT NULL, "setting_group" character varying(100), "description" text, "updated_by" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_e71167433328a5afb90dda43da0" UNIQUE ("key"), CONSTRAINT "PK_e4290e8371a166d7e066d131f6e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_6ff6ede58b63767ee813eb94a9" ON "site_settings" ("key") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "audit_log" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "actor_id" uuid, "actor_role" character varying(50) NOT NULL, "action" character varying(100) NOT NULL, "entity_type" character varying(100) NOT NULL, "entity_id" uuid, "changes" jsonb, "ip_address" character varying(45), "user_agent" character varying(512), "metadata" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_07fefa57f7f5ab8fc3f52b3ed0b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."pages_status_enum" AS ENUM('draft', 'published', 'archived')`,
    );
    await queryRunner.query(
      `CREATE TABLE "pages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying(255) NOT NULL, "slug" character varying(255) NOT NULL, "content" text, "rich_content" jsonb, "status" "public"."pages_status_enum" NOT NULL DEFAULT 'draft', "published_at" TIMESTAMP WITH TIME ZONE, "author_id" uuid, "locale" character varying(10) NOT NULL DEFAULT 'en', "meta_title" character varying(255), "meta_description" character varying(500), "sort_order" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_fe66ca6a86dc94233e5d7789535" UNIQUE ("slug"), CONSTRAINT "PK_8f21ed625aa34c8391d636b7d3b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c515459aa43b0485dc3d0c4ab1" ON "pages" ("slug") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "banners" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying(255) NOT NULL, "subtitle" character varying(500), "image_url" character varying(1024) NOT NULL, "mobile_image_url" character varying(1024), "link_url" character varying(1024), "placement" character varying(100) NOT NULL, "starts_at" TIMESTAMP WITH TIME ZONE, "expires_at" TIMESTAMP WITH TIME ZONE, "is_active" boolean NOT NULL DEFAULT true, "sort_order" integer NOT NULL DEFAULT '0', "locale" character varying(10), "target_audience" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_e9b186b959296fcb940790d31c3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "header_navigation_configs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "version" integer NOT NULL DEFAULT '1', "status" character varying(20) NOT NULL DEFAULT 'draft', "published_at" TIMESTAMP WITH TIME ZONE, "config" jsonb NOT NULL, "created_by" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_6170d24548d2af157c5589aad6a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."support_tickets_status_enum" AS ENUM('open', 'in_progress', 'waiting_customer', 'resolved', 'closed')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."support_tickets_priority_enum" AS ENUM('low', 'medium', 'high', 'urgent')`,
    );
    await queryRunner.query(
      `CREATE TABLE "support_tickets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ticket_number" character varying(30) NOT NULL, "user_id" uuid, "guest_session" character varying(255), "guest_email" character varying(255), "guest_name" character varying(255), "slack_thread_ts" character varying(64), "slack_channel_id" character varying(64), "assigned_to" uuid, "order_id" uuid, "subject" character varying(255) NOT NULL, "status" "public"."support_tickets_status_enum" NOT NULL DEFAULT 'open', "priority" "public"."support_tickets_priority_enum" NOT NULL DEFAULT 'medium', "category" character varying(100), "resolved_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_27bc711a89a033d5318df5e0201" UNIQUE ("ticket_number"), CONSTRAINT "PK_942e8d8f5df86100471d2324643" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_9113dc95d29b23ab6abe8b94d5" ON "support_tickets" ("ticket_number") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_support_tickets_guest_session" ON "support_tickets" ("guest_session") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_support_tickets_slack_thread" ON "support_tickets" ("slack_thread_ts") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "support_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ticket_id" uuid NOT NULL, "sender_id" uuid, "sender_role" character varying(20) NOT NULL, "message" text NOT NULL, "attachment_urls" jsonb NOT NULL DEFAULT '[]', "is_internal" boolean NOT NULL DEFAULT false, "origin" character varying(16) NOT NULL DEFAULT 'app', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_2aa37479e71ef29cbf4dba2b1a2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "cart_abandoned" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "cart_id" uuid NOT NULL, "user_id" uuid, "guest_session_id" uuid, "email" character varying(255), "cart_snapshot" jsonb NOT NULL, "cart_total" integer NOT NULL, "currency" character(3) NOT NULL DEFAULT 'AED', "item_count" integer NOT NULL DEFAULT '0', "reminder_sent_count" smallint NOT NULL DEFAULT '0', "last_reminder_at" TIMESTAMP WITH TIME ZONE, "recovered_at" TIMESTAMP WITH TIME ZONE, "recovered_order_id" uuid, "abandoned_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_041f7f98d2d213a50b35dcab140" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "section_types" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(100) NOT NULL, "label" jsonb NOT NULL, "description" text, "icon" character varying(100), "settings_schema" jsonb, "max_per_layout" smallint, "is_active" boolean NOT NULL DEFAULT true, "scope" character varying(20) NOT NULL DEFAULT 'platform', "supports_bidding" boolean NOT NULL DEFAULT false, "default_settings" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_ab7aa68c5dd25288eda6ead7695" UNIQUE ("name"), CONSTRAINT "PK_fe2e7e0e1ce4691acce3feba35b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."page_layouts_status_enum" AS ENUM('draft', 'published', 'scheduled', 'archived')`,
    );
    await queryRunner.query(
      `CREATE TABLE "page_layouts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "slug" character varying(255) NOT NULL, "vendor_id" uuid, "title" jsonb NOT NULL, "status" "public"."page_layouts_status_enum" NOT NULL DEFAULT 'draft', "published_version_id" uuid, "draft_version_id" uuid, "created_by" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_1d5d5d7605ac6cfa66836304d37" UNIQUE ("slug"), CONSTRAINT "PK_75360f592e7ba64dffd60a31eeb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "layout_versions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "layout_id" uuid NOT NULL, "version_number" integer NOT NULL, "publish_at" TIMESTAMP WITH TIME ZONE, "published_at" TIMESTAMP WITH TIME ZONE, "created_by" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_9a54bd4f0c6f474fda68288a9ee" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."layout_sections_source_mode_enum" AS ENUM('manual', 'query', 'bidded')`,
    );
    await queryRunner.query(
      `CREATE TABLE "layout_sections" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "version_id" uuid NOT NULL, "section_type_id" uuid NOT NULL, "position" smallint NOT NULL, "enabled" boolean NOT NULL DEFAULT true, "visibility" jsonb NOT NULL DEFAULT '{"mobile":true,"web":true}', "targeting" jsonb, "settings" jsonb NOT NULL DEFAULT '{}', "source_mode" "public"."layout_sections_source_mode_enum" NOT NULL DEFAULT 'manual', "data_source" jsonb, "blocks" jsonb, "bid_config" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_4a4593f0b0f0f4f056e8a88588f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."section_bids_status_enum" AS ENUM('pending', 'active', 'won', 'lost', 'expired', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TABLE "section_bids" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "section_id" uuid NOT NULL, "vendor_id" uuid NOT NULL, "bid_amount_fils" integer NOT NULL, "status" "public"."section_bids_status_enum" NOT NULL DEFAULT 'pending', "product_id" uuid, "content" jsonb, "starts_at" TIMESTAMP WITH TIME ZONE NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "cancellation_reason" character varying(50), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_e3d9e022dd402a2f8bc37126dfb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "section_bid_slots" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "section_type_id" uuid NOT NULL, "max_slots" smallint NOT NULL, "min_bid_fils" integer NOT NULL, "billing_model" character varying(20) NOT NULL DEFAULT 'per_day', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_9f04dba53f6bc728524152da9fc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."bulk_import_jobs_job_type_enum" AS ENUM('inventory_update', 'catalog_import')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."bulk_import_jobs_status_enum" AS ENUM('pending_upload', 'queued', 'running', 'completed', 'completed_with_errors', 'failed', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."bulk_import_jobs_strictness_enum" AS ENUM('all_or_nothing', 'best_effort')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."bulk_import_jobs_import_mode_enum" AS ENUM('upsert', 'update')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."user_role" AS ENUM('super_admin', 'admin', 'customer', 'guest')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."bulk_import_jobs_file_format_enum" AS ENUM('csv', 'xlsx')`,
    );
    await queryRunner.query(
      `CREATE TABLE "bulk_import_jobs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "job_type" "public"."bulk_import_jobs_job_type_enum" NOT NULL, "status" "public"."bulk_import_jobs_status_enum" NOT NULL DEFAULT 'pending_upload', "strictness" "public"."bulk_import_jobs_strictness_enum" NOT NULL, "import_mode" "public"."bulk_import_jobs_import_mode_enum" NOT NULL DEFAULT 'upsert', "vendor_id" uuid, "initiated_by_user_id" uuid NOT NULL, "initiated_by_role" "public"."user_role" NOT NULL, "file_s3_key" character varying(512) NOT NULL, "file_name" character varying(256) NOT NULL, "file_size_bytes" integer NOT NULL, "file_format" "public"."bulk_import_jobs_file_format_enum" NOT NULL, "total_rows" integer, "processed_rows" integer NOT NULL DEFAULT '0', "succeeded_rows" integer NOT NULL DEFAULT '0', "skipped_rows" integer NOT NULL DEFAULT '0', "images_total" integer NOT NULL DEFAULT '0', "images_processed" integer NOT NULL DEFAULT '0', "images_failed" integer NOT NULL DEFAULT '0', "error_report_s3_key" character varying(512), "summary" jsonb, "queued_at" TIMESTAMP WITH TIME ZONE, "started_at" TIMESTAMP WITH TIME ZONE, "completed_at" TIMESTAMP WITH TIME ZONE, "cancel_requested_at" TIMESTAMP WITH TIME ZONE, "reverted_at" TIMESTAMP WITH TIME ZONE, "reverted_by_user_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_720416f11ca7f831ce14ba08f31" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "bulk_import_job_row_errors" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "job_id" uuid NOT NULL, "row_number" integer NOT NULL, "sheet_name" character varying(64), "error_code" character varying(64) NOT NULL, "error_message" text NOT NULL, "field" character varying(64), "row_snapshot" jsonb NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_12d94f8d9d38e7424302b888a39" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e61a72ce0735a50282518a584d" ON "bulk_import_job_row_errors" ("job_id", "row_number") `,
    );
    await queryRunner.query(
      `CREATE TABLE "bulk_import_job_row_changes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "job_id" uuid NOT NULL, "row_number" integer NOT NULL, "entity_type" character varying(32) NOT NULL, "entity_id" uuid NOT NULL, "field" character varying(64) NOT NULL, "old_value" jsonb, "new_value" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_72d131688aff246d99689eaf21c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8174bcbffdbd39763c53de2732" ON "bulk_import_job_row_changes" ("job_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."bulk_import_job_image_tasks_status_enum" AS ENUM('queued', 'running', 'succeeded', 'failed', 'retrying')`,
    );
    await queryRunner.query(
      `CREATE TABLE "bulk_import_job_image_tasks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "job_id" uuid NOT NULL, "row_number" integer NOT NULL, "product_id" uuid NOT NULL, "variant_id" uuid, "source_url" text NOT NULL, "sort_order" smallint NOT NULL DEFAULT '0', "status" "public"."bulk_import_job_image_tasks_status_enum" NOT NULL DEFAULT 'queued', "attempt_count" smallint NOT NULL DEFAULT '0', "last_error" text, "product_image_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a03f655f2b44c14d521c7ba2419" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7da7de42633eda5b1cf937e137" ON "bulk_import_job_image_tasks" ("job_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."bulk_export_job_type_enum" AS ENUM('product_export')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."bulk_export_job_status_enum" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."bulk_export_file_format_enum" AS ENUM('csv', 'xlsx')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."product_export_preset_enum" AS ENUM('catalog_overview', 'pricing', 'inventory', 'media_health', 'seo', 'custom')`,
    );
    await queryRunner.query(
      `CREATE TABLE "bulk_export_jobs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "job_type" "public"."bulk_export_job_type_enum" NOT NULL, "status" "public"."bulk_export_job_status_enum" NOT NULL DEFAULT 'queued', "vendor_id" uuid, "initiated_by_user_id" uuid NOT NULL, "initiated_by_role" "public"."user_role" NOT NULL, "format" "public"."bulk_export_file_format_enum" NOT NULL, "preset" "public"."product_export_preset_enum" NOT NULL, "field_groups" jsonb NOT NULL, "fields" jsonb NOT NULL, "filters" jsonb NOT NULL, "file_s3_key" character varying(512), "file_name" character varying(256) NOT NULL, "file_size_bytes" integer, "row_counts" jsonb, "error_message" text, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "queued_at" TIMESTAMP WITH TIME ZONE, "started_at" TIMESTAMP WITH TIME ZONE, "completed_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_fd28501985bda5f6eda38ca4e77" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_bulk_export_jobs_status" ON "bulk_export_jobs" ("status", "created_at") WHERE deleted_at IS NULL AND status IN ('queued', 'running')`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_bulk_export_jobs_user_created" ON "bulk_export_jobs" ("initiated_by_user_id", "created_at") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_bulk_export_jobs_vendor_created" ON "bulk_export_jobs" ("vendor_id", "created_at") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."sales_channels_code_enum" AS ENUM('google_merchant', 'meta_catalog', 'tiktok')`,
    );
    await queryRunner.query(
      `CREATE TABLE "sales_channels" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" "public"."sales_channels_code_enum" NOT NULL, "display_name" character varying(100) NOT NULL, "is_enabled" boolean NOT NULL DEFAULT false, "credentials_encrypted" text, "config" jsonb NOT NULL DEFAULT '{}', "feed_url" text, "feed_format" character varying(8) NOT NULL DEFAULT 'xml', "delta_enabled" boolean NOT NULL DEFAULT true, "last_full_feed_at" TIMESTAMP WITH TIME ZONE, "last_full_feed_status" character varying(16), "last_delta_success_at" TIMESTAMP WITH TIME ZONE, "degraded_until" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_2cc4a647500deae01e9f9ef0e47" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "sales_channels_code_uq" ON "sales_channels" ("code") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."channel_listings_sync_status_enum" AS ENUM('pending', 'synced', 'excluded', 'error')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."channel_listings_review_status_enum" AS ENUM('pending', 'approved', 'disapproved')`,
    );
    await queryRunner.query(
      `CREATE TABLE "channel_listings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "channel_id" uuid NOT NULL, "product_id" uuid NOT NULL, "variant_id" uuid, "offer_id" character varying(128) NOT NULL, "sync_status" "public"."channel_listings_sync_status_enum" NOT NULL DEFAULT 'pending', "review_status" "public"."channel_listings_review_status_enum" NOT NULL DEFAULT 'pending', "disapproval_reasons" jsonb, "content_hash" character varying(64), "excluded" boolean NOT NULL DEFAULT false, "exclusion_reason" character varying(255), "last_synced_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_55b81574b7bd0381d59a4eba2b9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "channel_listings_review_idx" ON "channel_listings" ("channel_id", "review_status") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "channel_listings_offer_base_uq" ON "channel_listings" ("channel_id", "product_id") WHERE deleted_at IS NULL AND variant_id IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "channel_listings_offer_variant_uq" ON "channel_listings" ("channel_id", "product_id", "variant_id") WHERE deleted_at IS NULL AND variant_id IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "channel_category_mappings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "channel_id" uuid NOT NULL, "category_id" uuid NOT NULL, "external_category_id" character varying(64) NOT NULL, "external_category_path" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_53b5074276d10a1865fb8020ad0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "channel_category_mappings_uq" ON "channel_category_mappings" ("channel_id", "category_id") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "channel_feed_runs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "channel_id" uuid NOT NULL, "started_at" TIMESTAMP WITH TIME ZONE NOT NULL, "finished_at" TIMESTAMP WITH TIME ZONE, "status" character varying(16) NOT NULL, "item_count" integer NOT NULL DEFAULT '0', "excluded_count" integer NOT NULL DEFAULT '0', "error_count" integer NOT NULL DEFAULT '0', "file_url" text, "file_size_bytes" integer, "trigger" character varying(8) NOT NULL, "error_message" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_f4f12036eb21329144e382f5e91" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "channel_feed_runs_channel_created_idx" ON "channel_feed_runs" ("channel_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."channel_deliveries_kind_enum" AS ENUM('delta', 'conversion')`,
    );
    await queryRunner.query(
      `CREATE TABLE "channel_deliveries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "channel_id" uuid NOT NULL, "kind" "public"."channel_deliveries_kind_enum" NOT NULL, "event_name" character varying(48), "dedup_event_id" character varying(64), "order_id" uuid, "product_id" uuid, "payload" jsonb, "response_status" integer, "status" character varying(16) NOT NULL, "latency_ms" integer, "attempt" smallint NOT NULL DEFAULT '1', "error_message" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_20873e67faeb472d7f3f3a317d9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "channel_deliveries_channel_created_idx" ON "channel_deliveries" ("channel_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "rules_epoch" ("id" smallint NOT NULL, "epoch" bigint NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_7b8c46817aac52b651bb43b48a1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_addresses" ADD CONSTRAINT "FK_7a5100ce0548ef27a6f1533a5ce" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_verified_phones" ADD CONSTRAINT "FK_94143735b8eb744a002a1d42d25" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_sessions" ADD CONSTRAINT "FK_e9658e959c490b0a634dfc54783" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_tokens" ADD CONSTRAINT "FK_9e144a67be49e5bba91195ef5de" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_two_factor" ADD CONSTRAINT "FK_0e865d85e0ad6329b40523afe55" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_9a8a82462cab47c73d25f49261f" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_preferences" ADD CONSTRAINT "FK_64c90edc7310c6be7c10c96f675" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "newsletter_subscribers" ADD CONSTRAINT "FK_dcd5c5b83f0fba1ccef75e09a4c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "guest_sessions" ADD CONSTRAINT "FK_ca25eb82ca26487173e561cebba" FOREIGN KEY ("merged_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "recently_viewed" ADD CONSTRAINT "FK_13c5b56da6d00c32cb4c0764a0e" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "recently_viewed" ADD CONSTRAINT "FK_f38a305eb7ef25073319b20f552" FOREIGN KEY ("guest_session_id") REFERENCES "guest_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "recently_viewed" ADD CONSTRAINT "FK_72ecdebddea783ebe1ef655bbd0" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_searches" ADD CONSTRAINT "FK_8f01d13ac8e7b451d244674274f" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "recent_searches" ADD CONSTRAINT "FK_40e066371156ac8b5fed746b439" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_documents" ADD CONSTRAINT "FK_218ad2aece37d1c3bf7cfe6c72f" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_documents" ADD CONSTRAINT "FK_0a0e3fccb9f2d9977aad9b3956a" FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_bank_accounts" ADD CONSTRAINT "FK_94e674d49212d992777ba20b8fb" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_translations" ADD CONSTRAINT "FK_be516cd138f3a6318fb7b17dddb" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_followers" ADD CONSTRAINT "FK_0cf0b8f1c9b56d5458996369198" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_followers" ADD CONSTRAINT "FK_9fd05625f8610fd308f072cba22" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_integrations" ADD CONSTRAINT "FK_b567dfcc0aacfd7e1cc6429d1ae" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_integration_mappings" ADD CONSTRAINT "FK_2727b00bff7fdd22056a83c7129" FOREIGN KEY ("integration_id") REFERENCES "vendor_integrations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_members" ADD CONSTRAINT "FK_d0d3b6ba9896e44104938d7c705" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_members" ADD CONSTRAINT "FK_63045f9c571e25f19f3b4256e38" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" ADD CONSTRAINT "FK_78f1c9690ce4f4fa12167b1b1c2" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" ADD CONSTRAINT "FK_88cea2dc9c31951d06437879b40" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "category_translations" ADD CONSTRAINT "FK_87902f79e775e1c1b0082201d7e" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "attribute_translations" ADD CONSTRAINT "FK_2583b3debdb3b08665739a485c6" FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "attribute_values" ADD CONSTRAINT "FK_be02d0f6a15bc7a0d835f832b62" FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "attribute_value_translations" ADD CONSTRAINT "FK_410e7e5753e3f567d7d61b4613d" FOREIGN KEY ("attribute_value_id") REFERENCES "attribute_values"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "category_attributes" ADD CONSTRAINT "FK_55050a8a1b2d2f5202f226d4ac1" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "category_attributes" ADD CONSTRAINT "FK_6730826326fa81ff5511cb0981a" FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "brand_translations" ADD CONSTRAINT "FK_1b2c9801cdefca32f03214285d9" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "FK_0e859a83f1dd6b774c20c02885d" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "FK_9a5f6868c96e0069e699f33e124" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "FK_1530a6f15d3c79d1b70be98f2be" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_translations" ADD CONSTRAINT "FK_1b7b07c6049367c6446c5ac5605" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_categories" ADD CONSTRAINT "FK_8748b4a0e8de6d266f2bbc877f6" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_categories" ADD CONSTRAINT "FK_9148da8f26fc248e77a387e3112" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_images" ADD CONSTRAINT "FK_4f166bb8c2bfcef2498d97b4068" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_videos" ADD CONSTRAINT "FK_4bee29aa25fc3adccf1653731df" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_variants" ADD CONSTRAINT "FK_6343513e20e2deab45edfce1316" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_groups" ADD CONSTRAINT "FK_40d2deecb1be0cfe20df409e03e" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_groups" ADD CONSTRAINT "FK_7682efca19e4de1da2a4b502ac3" FOREIGN KEY ("grouping_attribute_id") REFERENCES "attributes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_group_members" ADD CONSTRAINT "FK_09ceada76f54ed8076e8399c3de" FOREIGN KEY ("group_id") REFERENCES "product_groups"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_group_members" ADD CONSTRAINT "FK_015f952ffa573bcbe768092f3f7" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_group_members" ADD CONSTRAINT "FK_468b77bcda61287386d759f55f8" FOREIGN KEY ("attribute_value_id") REFERENCES "attribute_values"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "warehouses" ADD CONSTRAINT "FK_046d296445fddeb2a66ac728254" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "warehouses" ADD CONSTRAINT "FK_9f4911a7f6d48103d4c5a51b890" FOREIGN KEY ("zone_id") REFERENCES "delivery_zones"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "warehouse_vendor_permissions" ADD CONSTRAINT "FK_05ce8f2b6e5976f191bae510c67" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "warehouse_vendor_permissions" ADD CONSTRAINT "FK_785631187b07e76e498bba93823" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory" ADD CONSTRAINT "FK_732fdb1f76432d65d2c136340dc" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_movements" ADD CONSTRAINT "FK_7c5f8fa417b520f26f911c3c6b5" FOREIGN KEY ("inventory_id") REFERENCES "inventory"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_movements" ADD CONSTRAINT "FK_5c3bec1682252c36fa161587738" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_movements" ADD CONSTRAINT "FK_1bb851d7c7ef2435fad91cae453" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_movements" ADD CONSTRAINT "FK_4a137ccc372acb73821c4dd3991" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_reservations" ADD CONSTRAINT "FK_133111c3075072ba9590e4d273e" FOREIGN KEY ("inventory_id") REFERENCES "inventory"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_reservations" ADD CONSTRAINT "FK_f18e859e07c6a1a4f3350886492" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_reservations" ADD CONSTRAINT "FK_61650b118e5290e1497c0fd9443" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_attribute_values" ADD CONSTRAINT "FK_61655fe2f6d179eced519392ced" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_attribute_values" ADD CONSTRAINT "FK_3696b9ebdc6b3501a6c454c0925" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_attribute_values" ADD CONSTRAINT "FK_f1f04534a41f575a6def0710063" FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_attribute_values" ADD CONSTRAINT "FK_5b1f7c69bb70bbf112f907c3187" FOREIGN KEY ("attribute_value_id") REFERENCES "attribute_values"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "wishlists" ADD CONSTRAINT "FK_b5e6331a1a7d61c25d7a25cab8f" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "wishlists" ADD CONSTRAINT "FK_712575f01a7d4aa88889ac484ae" FOREIGN KEY ("guest_session_id") REFERENCES "guest_sessions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "wishlists" ADD CONSTRAINT "FK_2662acbb3868b1f0077fda61dd2" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "wishlists" ADD CONSTRAINT "FK_cfcd97a9f1a9f6c9595e850ee9e" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "carts" ADD CONSTRAINT "FK_2ec1c94a977b940d85a4f498aea" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "carts" ADD CONSTRAINT "FK_1b9c92b7e9f58d8f45607e2c563" FOREIGN KEY ("guest_session_id") REFERENCES "guest_sessions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "carts" ADD CONSTRAINT "FK_f1f73556b14ea09a1c7182a7fba" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_items" ADD CONSTRAINT "FK_6385a745d9e12a89b859bb25623" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_items" ADD CONSTRAINT "FK_30e89257a105eab7648a35c7fce" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_items" ADD CONSTRAINT "FK_ede780fc2b865d1d1323e598038" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_items" ADD CONSTRAINT "FK_e9988742a48760c05b8a0c1d4b4" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_relations" ADD CONSTRAINT "FK_b355e289844b41b0a41dd425bf4" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_relations" ADD CONSTRAINT "FK_4b1d79cf6757f8cb7559f79e5a3" FOREIGN KEY ("related_product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_bundles" ADD CONSTRAINT "FK_50c6fe5823d0449cb99daeaa79c" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle_items" ADD CONSTRAINT "FK_204a2f0fd03ca0efbf9db586b7f" FOREIGN KEY ("bundle_id") REFERENCES "product_bundles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_questions" ADD CONSTRAINT "FK_e31bd9196b72fdc6838cabbc1c9" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_questions" ADD CONSTRAINT "FK_6b878f8b89eb7644042b2935aa4" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_questions" ADD CONSTRAINT "FK_51ffe135836a0dde2b681444a39" FOREIGN KEY ("answered_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "price_history" ADD CONSTRAINT "FK_ebdb4d54c8de7847c0f7a9e4fbb" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "price_history" ADD CONSTRAINT "FK_c07ec713720618800b931088af3" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "price_history" ADD CONSTRAINT "FK_fa6cd9b9d5af19777480bf56fc3" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_a922b820eeef29ac1c6800e826a" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_orders" ADD CONSTRAINT "FK_5044c3c237f11946768a05a6a50" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_orders" ADD CONSTRAINT "FK_278a24fad52a1cb864326bf8480" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_145532db85752b29c57d2b7b1f1" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_1f8f9044b04fb5300c2349293a6" FOREIGN KEY ("vendor_order_id") REFERENCES "vendor_orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_5df67164fb31bb298632acbbb0a" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_9263386c35b6b242540f9493b00" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_db2d0ea722e16e0fe8ab3bce111" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_status_history" ADD CONSTRAINT "FK_1ca7d5228cf9dc589b60243933c" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_status_history" ADD CONSTRAINT "FK_0df271e937ef47355b8c7cdb57e" FOREIGN KEY ("vendor_order_id") REFERENCES "vendor_orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_status_history" ADD CONSTRAINT "FK_8a1a732e06a3031806d00d9a41a" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_status_history" ADD CONSTRAINT "FK_de5bb51ff61072261b6b3419f83" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_item_cancellations" ADD CONSTRAINT "FK_e99e31540e613b5f5be16965ad6" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_item_cancellations" ADD CONSTRAINT "FK_a4a25e8a68bda226631ea535f87" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipments" ADD CONSTRAINT "FK_e86fac2a18a75dcb82bfbb23f43" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipments" ADD CONSTRAINT "FK_39c4b6b9e5bba9c2c2764e0f93b" FOREIGN KEY ("vendor_order_id") REFERENCES "vendor_orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipments" ADD CONSTRAINT "FK_cd335c261a1724ddde0d2abb413" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipment_events" ADD CONSTRAINT "FK_7550a4aa8c7fe2d64f6c71d7da1" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipment_items" ADD CONSTRAINT "FK_ccc68015ca35631ff542230b209" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipment_items" ADD CONSTRAINT "FK_d59fe595543de933da7020c0055" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipment_status_history" ADD CONSTRAINT "FK_f19e542c7880b7c39fdda680f6e" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipment_status_history" ADD CONSTRAINT "FK_5938f407ad7c08fb6d62b52005c" FOREIGN KEY ("vendor_order_id") REFERENCES "vendor_orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "returns" ADD CONSTRAINT "FK_7c0b171a97595625487728ddb3e" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "returns" ADD CONSTRAINT "FK_93b1729d20cbf9607b8a3d4a901" FOREIGN KEY ("vendor_order_id") REFERENCES "vendor_orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "returns" ADD CONSTRAINT "FK_e7a28fbb9eb438bc99e7326fc30" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "returns" ADD CONSTRAINT "FK_90505ed73ddc4b3b9ad8d78b84e" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "returns" ADD CONSTRAINT "FK_5a51fda169d9614c8c2e7c47032" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "return_items" ADD CONSTRAINT "FK_afc80619fe38ae5911b464af463" FOREIGN KEY ("return_id") REFERENCES "returns"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "return_items" ADD CONSTRAINT "FK_c57d201363c110de07d1fd32027" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "disputes" ADD CONSTRAINT "FK_0870855d9ec9cb26fecd2955a6d" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "disputes" ADD CONSTRAINT "FK_f9f9054f68054f1fbe1c357206f" FOREIGN KEY ("vendor_order_id") REFERENCES "vendor_orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "disputes" ADD CONSTRAINT "FK_c3ffcb33edc68552b3f9fcab381" FOREIGN KEY ("opened_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "disputes" ADD CONSTRAINT "FK_d12b47b4de6a9f32748af3d33a6" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "disputes" ADD CONSTRAINT "FK_b2b781a79bf8721e0f8bba04cb2" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "disputes" ADD CONSTRAINT "FK_573e2d4b2acb74b7f74a4d4735a" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "dispute_messages" ADD CONSTRAINT "FK_69d15df0f67f230dd93be976214" FOREIGN KEY ("dispute_id") REFERENCES "disputes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "dispute_messages" ADD CONSTRAINT "FK_bca9076e4615647358d14823325" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_b2f7b823a21562eeca20e72b006" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_427785468fb7d2733f59e7d7d39" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tax_rates" ADD CONSTRAINT "FK_b2288e39ae19a91ce29f55f8344" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "commissions" ADD CONSTRAINT "FK_6e9671436739516dc8c3d2c332a" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "commissions" ADD CONSTRAINT "FK_dacb8f7c50aca368cf461526d81" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "commissions" ADD CONSTRAINT "FK_60315686e2d3f6bdcc7d03f3c3c" FOREIGN KEY ("vendor_order_id") REFERENCES "vendor_orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "commissions" ADD CONSTRAINT "FK_35709ac3afc1faba2c310000867" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "commissions" ADD CONSTRAINT "FK_eec7f0191c45412ada72b72c574" FOREIGN KEY ("payout_id") REFERENCES "vendor_payouts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_payouts" ADD CONSTRAINT "FK_7848ea6f2544c6edc74b625a0ce" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_payouts" ADD CONSTRAINT "FK_742f29d7085689dc88d9e273a78" FOREIGN KEY ("bank_account_id") REFERENCES "vendor_bank_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_payout_adjustments" ADD CONSTRAINT "FK_fa6be81c82219a4d8fcb87d73c5" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_payout_adjustments" ADD CONSTRAINT "FK_3c45a2c7ea4f952c3a88499d057" FOREIGN KEY ("settled_payout_id") REFERENCES "vendor_payouts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallet_transactions" ADD CONSTRAINT "FK_4796762c619893704abbc3dce65" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallet_transactions" ADD CONSTRAINT "FK_8aeb5b463c31d097315acf23945" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "FK_9482e9567d8dcc2bc615981ef44" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "FK_9ac2c42bb939e88ca13e0c6b288" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "FK_728447781a30bc3fcfe5c2f1cdf" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "FK_eb97a06e4fcd030190bd8155dae" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "FK_fd0b7962b796b587fc4d759110b" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "review_votes" ADD CONSTRAINT "FK_af2c4c96175fc38988113888ef6" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "review_votes" ADD CONSTRAINT "FK_7f5ce2080e4dbf66c98fa717d65" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupons" ADD CONSTRAINT "FK_37991c03c8b139aadec462022ae" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupon_products" ADD CONSTRAINT "FK_edd5b3b5e912ada7e6d28277e2c" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupon_products" ADD CONSTRAINT "FK_4897e96fb4b70bd6ac1d4735bae" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupon_categories" ADD CONSTRAINT "FK_4746aa0d652b072947823dbaf48" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupon_categories" ADD CONSTRAINT "FK_c53cdd152a176ce12653afe1aa6" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupon_vendors" ADD CONSTRAINT "FK_14d1cc1d22920b1a49f7189d8eb" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupon_vendors" ADD CONSTRAINT "FK_8aff1157e08dba1a89fe10962af" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupon_excluded_products" ADD CONSTRAINT "FK_c0c746cd6d6aab6242bc98c1b62" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupon_excluded_products" ADD CONSTRAINT "FK_8ac32bd8f9ec840330e8bfa37e2" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupon_user_restrictions" ADD CONSTRAINT "FK_ee30d2df957de27cf85a013b548" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupon_user_restrictions" ADD CONSTRAINT "FK_fe4318caac57a2c95b8bd4e348f" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupon_usages" ADD CONSTRAINT "FK_56491a0d0010feb079b964e23b4" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupon_usages" ADD CONSTRAINT "FK_579f1e1f0ccf35785bbbdebeb85" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupon_usages" ADD CONSTRAINT "FK_f017af60a02209a6b045f673ca1" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipping_rates" ADD CONSTRAINT "FK_5ae304b156630c4457e217b79e2" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipping_rates" ADD CONSTRAINT "FK_815ef893e8b41030146099282ac" FOREIGN KEY ("zone_id") REFERENCES "delivery_zones"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipping_contribution_tiers" ADD CONSTRAINT "FK_7fca43a4f44a4e9dcfa8ba7bb10" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_carrier_accounts" ADD CONSTRAINT "FK_4113da93efcbbcf1cb7ebec0c7a" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_carrier_accounts" ADD CONSTRAINT "FK_8de1d655abe5c3d9b8c343c054d" FOREIGN KEY ("provider_id") REFERENCES "shipping_providers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "site_settings" ADD CONSTRAINT "FK_f4f6d58d0d931610e228b25fef7" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "pages" ADD CONSTRAINT "FK_4cfa4caf7f1c553220d70987fb2" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_tickets" ADD CONSTRAINT "FK_0b1eb4f1f984aab3c481c48468a" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_tickets" ADD CONSTRAINT "FK_1497d97a1193ff937dea51ac1ea" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_tickets" ADD CONSTRAINT "FK_4c3a306f404bff5817f37d46616" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_messages" ADD CONSTRAINT "FK_d5e0c744062d01ccda719d7ef17" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_messages" ADD CONSTRAINT "FK_db9f9d46849e30b9ac570db6eb6" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_abandoned" ADD CONSTRAINT "FK_da2303315fcdf6dc6f1460b2e83" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_abandoned" ADD CONSTRAINT "FK_8622c97963d8441379dd5fd8ee1" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_abandoned" ADD CONSTRAINT "FK_54b5e2ddd488818c326d72d181d" FOREIGN KEY ("guest_session_id") REFERENCES "guest_sessions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_abandoned" ADD CONSTRAINT "FK_9500fe205d8be3cdc89eb52bb8f" FOREIGN KEY ("recovered_order_id") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "page_layouts" ADD CONSTRAINT "FK_09512aca377c10da97ed5744932" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "page_layouts" ADD CONSTRAINT "FK_b0751ae076487c62e91580cbe24" FOREIGN KEY ("published_version_id") REFERENCES "layout_versions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "page_layouts" ADD CONSTRAINT "FK_c3771b0eb04b91f210227935890" FOREIGN KEY ("draft_version_id") REFERENCES "layout_versions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "layout_versions" ADD CONSTRAINT "FK_426947546ad0c048d0a1baa12bb" FOREIGN KEY ("layout_id") REFERENCES "page_layouts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "layout_sections" ADD CONSTRAINT "FK_0b9e9c68f375a10323bec888bca" FOREIGN KEY ("version_id") REFERENCES "layout_versions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "layout_sections" ADD CONSTRAINT "FK_7a0387998b4802f910da1c004a0" FOREIGN KEY ("section_type_id") REFERENCES "section_types"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "section_bids" ADD CONSTRAINT "FK_40a5ca1d32f45b17f13e01776e2" FOREIGN KEY ("section_id") REFERENCES "layout_sections"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "section_bid_slots" ADD CONSTRAINT "FK_c56378b50ff447826f7299a89c1" FOREIGN KEY ("section_type_id") REFERENCES "section_types"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bulk_import_jobs" ADD CONSTRAINT "FK_eb97ed18210014a271e6f669202" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bulk_import_jobs" ADD CONSTRAINT "FK_d09e8a7ce0749e7493f8a4a1b40" FOREIGN KEY ("initiated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bulk_import_job_row_errors" ADD CONSTRAINT "FK_fce347cc2b95800f91625b10310" FOREIGN KEY ("job_id") REFERENCES "bulk_import_jobs"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bulk_import_job_row_changes" ADD CONSTRAINT "FK_8174bcbffdbd39763c53de2732b" FOREIGN KEY ("job_id") REFERENCES "bulk_import_jobs"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bulk_import_job_image_tasks" ADD CONSTRAINT "FK_1617192533e7f47b37bae0dfaeb" FOREIGN KEY ("job_id") REFERENCES "bulk_import_jobs"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bulk_import_job_image_tasks" ADD CONSTRAINT "FK_b95833e48a4dd0a4752258fbda1" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bulk_import_job_image_tasks" ADD CONSTRAINT "FK_d976d07284abc28340c00ad5c08" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bulk_import_job_image_tasks" ADD CONSTRAINT "FK_57b3fd31a31e61c96f3ef4b5ea5" FOREIGN KEY ("product_image_id") REFERENCES "product_images"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bulk_export_jobs" ADD CONSTRAINT "FK_5032b2be6017f31794ef9362190" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bulk_export_jobs" ADD CONSTRAINT "FK_8130b5315d155f6f34e56a638bb" FOREIGN KEY ("initiated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bulk_export_jobs" DROP CONSTRAINT "FK_8130b5315d155f6f34e56a638bb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bulk_export_jobs" DROP CONSTRAINT "FK_5032b2be6017f31794ef9362190"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bulk_import_job_image_tasks" DROP CONSTRAINT "FK_57b3fd31a31e61c96f3ef4b5ea5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bulk_import_job_image_tasks" DROP CONSTRAINT "FK_d976d07284abc28340c00ad5c08"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bulk_import_job_image_tasks" DROP CONSTRAINT "FK_b95833e48a4dd0a4752258fbda1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bulk_import_job_image_tasks" DROP CONSTRAINT "FK_1617192533e7f47b37bae0dfaeb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bulk_import_job_row_changes" DROP CONSTRAINT "FK_8174bcbffdbd39763c53de2732b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bulk_import_job_row_errors" DROP CONSTRAINT "FK_fce347cc2b95800f91625b10310"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bulk_import_jobs" DROP CONSTRAINT "FK_d09e8a7ce0749e7493f8a4a1b40"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bulk_import_jobs" DROP CONSTRAINT "FK_eb97ed18210014a271e6f669202"`,
    );
    await queryRunner.query(
      `ALTER TABLE "section_bid_slots" DROP CONSTRAINT "FK_c56378b50ff447826f7299a89c1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "section_bids" DROP CONSTRAINT "FK_40a5ca1d32f45b17f13e01776e2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "layout_sections" DROP CONSTRAINT "FK_7a0387998b4802f910da1c004a0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "layout_sections" DROP CONSTRAINT "FK_0b9e9c68f375a10323bec888bca"`,
    );
    await queryRunner.query(
      `ALTER TABLE "layout_versions" DROP CONSTRAINT "FK_426947546ad0c048d0a1baa12bb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "page_layouts" DROP CONSTRAINT "FK_c3771b0eb04b91f210227935890"`,
    );
    await queryRunner.query(
      `ALTER TABLE "page_layouts" DROP CONSTRAINT "FK_b0751ae076487c62e91580cbe24"`,
    );
    await queryRunner.query(
      `ALTER TABLE "page_layouts" DROP CONSTRAINT "FK_09512aca377c10da97ed5744932"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_abandoned" DROP CONSTRAINT "FK_9500fe205d8be3cdc89eb52bb8f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_abandoned" DROP CONSTRAINT "FK_54b5e2ddd488818c326d72d181d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_abandoned" DROP CONSTRAINT "FK_8622c97963d8441379dd5fd8ee1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_abandoned" DROP CONSTRAINT "FK_da2303315fcdf6dc6f1460b2e83"`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_messages" DROP CONSTRAINT "FK_db9f9d46849e30b9ac570db6eb6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_messages" DROP CONSTRAINT "FK_d5e0c744062d01ccda719d7ef17"`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_tickets" DROP CONSTRAINT "FK_4c3a306f404bff5817f37d46616"`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_tickets" DROP CONSTRAINT "FK_1497d97a1193ff937dea51ac1ea"`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_tickets" DROP CONSTRAINT "FK_0b1eb4f1f984aab3c481c48468a"`,
    );
    await queryRunner.query(`ALTER TABLE "pages" DROP CONSTRAINT "FK_4cfa4caf7f1c553220d70987fb2"`);
    await queryRunner.query(
      `ALTER TABLE "site_settings" DROP CONSTRAINT "FK_f4f6d58d0d931610e228b25fef7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_carrier_accounts" DROP CONSTRAINT "FK_8de1d655abe5c3d9b8c343c054d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_carrier_accounts" DROP CONSTRAINT "FK_4113da93efcbbcf1cb7ebec0c7a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipping_contribution_tiers" DROP CONSTRAINT "FK_7fca43a4f44a4e9dcfa8ba7bb10"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipping_rates" DROP CONSTRAINT "FK_815ef893e8b41030146099282ac"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipping_rates" DROP CONSTRAINT "FK_5ae304b156630c4457e217b79e2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupon_usages" DROP CONSTRAINT "FK_f017af60a02209a6b045f673ca1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupon_usages" DROP CONSTRAINT "FK_579f1e1f0ccf35785bbbdebeb85"`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupon_usages" DROP CONSTRAINT "FK_56491a0d0010feb079b964e23b4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupon_user_restrictions" DROP CONSTRAINT "FK_fe4318caac57a2c95b8bd4e348f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupon_user_restrictions" DROP CONSTRAINT "FK_ee30d2df957de27cf85a013b548"`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupon_excluded_products" DROP CONSTRAINT "FK_8ac32bd8f9ec840330e8bfa37e2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupon_excluded_products" DROP CONSTRAINT "FK_c0c746cd6d6aab6242bc98c1b62"`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupon_vendors" DROP CONSTRAINT "FK_8aff1157e08dba1a89fe10962af"`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupon_vendors" DROP CONSTRAINT "FK_14d1cc1d22920b1a49f7189d8eb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupon_categories" DROP CONSTRAINT "FK_c53cdd152a176ce12653afe1aa6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupon_categories" DROP CONSTRAINT "FK_4746aa0d652b072947823dbaf48"`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupon_products" DROP CONSTRAINT "FK_4897e96fb4b70bd6ac1d4735bae"`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupon_products" DROP CONSTRAINT "FK_edd5b3b5e912ada7e6d28277e2c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupons" DROP CONSTRAINT "FK_37991c03c8b139aadec462022ae"`,
    );
    await queryRunner.query(
      `ALTER TABLE "review_votes" DROP CONSTRAINT "FK_7f5ce2080e4dbf66c98fa717d65"`,
    );
    await queryRunner.query(
      `ALTER TABLE "review_votes" DROP CONSTRAINT "FK_af2c4c96175fc38988113888ef6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" DROP CONSTRAINT "FK_fd0b7962b796b587fc4d759110b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" DROP CONSTRAINT "FK_eb97a06e4fcd030190bd8155dae"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" DROP CONSTRAINT "FK_728447781a30bc3fcfe5c2f1cdf"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" DROP CONSTRAINT "FK_9ac2c42bb939e88ca13e0c6b288"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" DROP CONSTRAINT "FK_9482e9567d8dcc2bc615981ef44"`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallet_transactions" DROP CONSTRAINT "FK_8aeb5b463c31d097315acf23945"`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallet_transactions" DROP CONSTRAINT "FK_4796762c619893704abbc3dce65"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_payout_adjustments" DROP CONSTRAINT "FK_3c45a2c7ea4f952c3a88499d057"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_payout_adjustments" DROP CONSTRAINT "FK_fa6be81c82219a4d8fcb87d73c5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_payouts" DROP CONSTRAINT "FK_742f29d7085689dc88d9e273a78"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_payouts" DROP CONSTRAINT "FK_7848ea6f2544c6edc74b625a0ce"`,
    );
    await queryRunner.query(
      `ALTER TABLE "commissions" DROP CONSTRAINT "FK_eec7f0191c45412ada72b72c574"`,
    );
    await queryRunner.query(
      `ALTER TABLE "commissions" DROP CONSTRAINT "FK_35709ac3afc1faba2c310000867"`,
    );
    await queryRunner.query(
      `ALTER TABLE "commissions" DROP CONSTRAINT "FK_60315686e2d3f6bdcc7d03f3c3c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "commissions" DROP CONSTRAINT "FK_dacb8f7c50aca368cf461526d81"`,
    );
    await queryRunner.query(
      `ALTER TABLE "commissions" DROP CONSTRAINT "FK_6e9671436739516dc8c3d2c332a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tax_rates" DROP CONSTRAINT "FK_b2288e39ae19a91ce29f55f8344"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "FK_427785468fb7d2733f59e7d7d39"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "FK_b2f7b823a21562eeca20e72b006"`,
    );
    await queryRunner.query(
      `ALTER TABLE "dispute_messages" DROP CONSTRAINT "FK_bca9076e4615647358d14823325"`,
    );
    await queryRunner.query(
      `ALTER TABLE "dispute_messages" DROP CONSTRAINT "FK_69d15df0f67f230dd93be976214"`,
    );
    await queryRunner.query(
      `ALTER TABLE "disputes" DROP CONSTRAINT "FK_573e2d4b2acb74b7f74a4d4735a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "disputes" DROP CONSTRAINT "FK_b2b781a79bf8721e0f8bba04cb2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "disputes" DROP CONSTRAINT "FK_d12b47b4de6a9f32748af3d33a6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "disputes" DROP CONSTRAINT "FK_c3ffcb33edc68552b3f9fcab381"`,
    );
    await queryRunner.query(
      `ALTER TABLE "disputes" DROP CONSTRAINT "FK_f9f9054f68054f1fbe1c357206f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "disputes" DROP CONSTRAINT "FK_0870855d9ec9cb26fecd2955a6d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "return_items" DROP CONSTRAINT "FK_c57d201363c110de07d1fd32027"`,
    );
    await queryRunner.query(
      `ALTER TABLE "return_items" DROP CONSTRAINT "FK_afc80619fe38ae5911b464af463"`,
    );
    await queryRunner.query(
      `ALTER TABLE "returns" DROP CONSTRAINT "FK_5a51fda169d9614c8c2e7c47032"`,
    );
    await queryRunner.query(
      `ALTER TABLE "returns" DROP CONSTRAINT "FK_90505ed73ddc4b3b9ad8d78b84e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "returns" DROP CONSTRAINT "FK_e7a28fbb9eb438bc99e7326fc30"`,
    );
    await queryRunner.query(
      `ALTER TABLE "returns" DROP CONSTRAINT "FK_93b1729d20cbf9607b8a3d4a901"`,
    );
    await queryRunner.query(
      `ALTER TABLE "returns" DROP CONSTRAINT "FK_7c0b171a97595625487728ddb3e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipment_status_history" DROP CONSTRAINT "FK_5938f407ad7c08fb6d62b52005c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipment_status_history" DROP CONSTRAINT "FK_f19e542c7880b7c39fdda680f6e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipment_items" DROP CONSTRAINT "FK_d59fe595543de933da7020c0055"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipment_items" DROP CONSTRAINT "FK_ccc68015ca35631ff542230b209"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipment_events" DROP CONSTRAINT "FK_7550a4aa8c7fe2d64f6c71d7da1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipments" DROP CONSTRAINT "FK_cd335c261a1724ddde0d2abb413"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipments" DROP CONSTRAINT "FK_39c4b6b9e5bba9c2c2764e0f93b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipments" DROP CONSTRAINT "FK_e86fac2a18a75dcb82bfbb23f43"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_item_cancellations" DROP CONSTRAINT "FK_a4a25e8a68bda226631ea535f87"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_item_cancellations" DROP CONSTRAINT "FK_e99e31540e613b5f5be16965ad6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_status_history" DROP CONSTRAINT "FK_de5bb51ff61072261b6b3419f83"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_status_history" DROP CONSTRAINT "FK_8a1a732e06a3031806d00d9a41a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_status_history" DROP CONSTRAINT "FK_0df271e937ef47355b8c7cdb57e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_status_history" DROP CONSTRAINT "FK_1ca7d5228cf9dc589b60243933c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_db2d0ea722e16e0fe8ab3bce111"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_9263386c35b6b242540f9493b00"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_5df67164fb31bb298632acbbb0a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_1f8f9044b04fb5300c2349293a6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_145532db85752b29c57d2b7b1f1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_orders" DROP CONSTRAINT "FK_278a24fad52a1cb864326bf8480"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_orders" DROP CONSTRAINT "FK_5044c3c237f11946768a05a6a50"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_a922b820eeef29ac1c6800e826a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "price_history" DROP CONSTRAINT "FK_fa6cd9b9d5af19777480bf56fc3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "price_history" DROP CONSTRAINT "FK_c07ec713720618800b931088af3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "price_history" DROP CONSTRAINT "FK_ebdb4d54c8de7847c0f7a9e4fbb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_questions" DROP CONSTRAINT "FK_51ffe135836a0dde2b681444a39"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_questions" DROP CONSTRAINT "FK_6b878f8b89eb7644042b2935aa4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_questions" DROP CONSTRAINT "FK_e31bd9196b72fdc6838cabbc1c9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle_items" DROP CONSTRAINT "FK_204a2f0fd03ca0efbf9db586b7f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_bundles" DROP CONSTRAINT "FK_50c6fe5823d0449cb99daeaa79c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_relations" DROP CONSTRAINT "FK_4b1d79cf6757f8cb7559f79e5a3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_relations" DROP CONSTRAINT "FK_b355e289844b41b0a41dd425bf4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_items" DROP CONSTRAINT "FK_e9988742a48760c05b8a0c1d4b4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_items" DROP CONSTRAINT "FK_ede780fc2b865d1d1323e598038"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_items" DROP CONSTRAINT "FK_30e89257a105eab7648a35c7fce"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_items" DROP CONSTRAINT "FK_6385a745d9e12a89b859bb25623"`,
    );
    await queryRunner.query(`ALTER TABLE "carts" DROP CONSTRAINT "FK_f1f73556b14ea09a1c7182a7fba"`);
    await queryRunner.query(`ALTER TABLE "carts" DROP CONSTRAINT "FK_1b9c92b7e9f58d8f45607e2c563"`);
    await queryRunner.query(`ALTER TABLE "carts" DROP CONSTRAINT "FK_2ec1c94a977b940d85a4f498aea"`);
    await queryRunner.query(
      `ALTER TABLE "wishlists" DROP CONSTRAINT "FK_cfcd97a9f1a9f6c9595e850ee9e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "wishlists" DROP CONSTRAINT "FK_2662acbb3868b1f0077fda61dd2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "wishlists" DROP CONSTRAINT "FK_712575f01a7d4aa88889ac484ae"`,
    );
    await queryRunner.query(
      `ALTER TABLE "wishlists" DROP CONSTRAINT "FK_b5e6331a1a7d61c25d7a25cab8f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_attribute_values" DROP CONSTRAINT "FK_5b1f7c69bb70bbf112f907c3187"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_attribute_values" DROP CONSTRAINT "FK_f1f04534a41f575a6def0710063"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_attribute_values" DROP CONSTRAINT "FK_3696b9ebdc6b3501a6c454c0925"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_attribute_values" DROP CONSTRAINT "FK_61655fe2f6d179eced519392ced"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_reservations" DROP CONSTRAINT "FK_61650b118e5290e1497c0fd9443"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_reservations" DROP CONSTRAINT "FK_f18e859e07c6a1a4f3350886492"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_reservations" DROP CONSTRAINT "FK_133111c3075072ba9590e4d273e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_movements" DROP CONSTRAINT "FK_4a137ccc372acb73821c4dd3991"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_movements" DROP CONSTRAINT "FK_1bb851d7c7ef2435fad91cae453"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_movements" DROP CONSTRAINT "FK_5c3bec1682252c36fa161587738"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_movements" DROP CONSTRAINT "FK_7c5f8fa417b520f26f911c3c6b5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory" DROP CONSTRAINT "FK_732fdb1f76432d65d2c136340dc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "warehouse_vendor_permissions" DROP CONSTRAINT "FK_785631187b07e76e498bba93823"`,
    );
    await queryRunner.query(
      `ALTER TABLE "warehouse_vendor_permissions" DROP CONSTRAINT "FK_05ce8f2b6e5976f191bae510c67"`,
    );
    await queryRunner.query(
      `ALTER TABLE "warehouses" DROP CONSTRAINT "FK_9f4911a7f6d48103d4c5a51b890"`,
    );
    await queryRunner.query(
      `ALTER TABLE "warehouses" DROP CONSTRAINT "FK_046d296445fddeb2a66ac728254"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_group_members" DROP CONSTRAINT "FK_468b77bcda61287386d759f55f8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_group_members" DROP CONSTRAINT "FK_015f952ffa573bcbe768092f3f7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_group_members" DROP CONSTRAINT "FK_09ceada76f54ed8076e8399c3de"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_groups" DROP CONSTRAINT "FK_7682efca19e4de1da2a4b502ac3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_groups" DROP CONSTRAINT "FK_40d2deecb1be0cfe20df409e03e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_variants" DROP CONSTRAINT "FK_6343513e20e2deab45edfce1316"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_videos" DROP CONSTRAINT "FK_4bee29aa25fc3adccf1653731df"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_images" DROP CONSTRAINT "FK_4f166bb8c2bfcef2498d97b4068"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_categories" DROP CONSTRAINT "FK_9148da8f26fc248e77a387e3112"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_categories" DROP CONSTRAINT "FK_8748b4a0e8de6d266f2bbc877f6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_translations" DROP CONSTRAINT "FK_1b7b07c6049367c6446c5ac5605"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT "FK_1530a6f15d3c79d1b70be98f2be"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT "FK_9a5f6868c96e0069e699f33e124"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT "FK_0e859a83f1dd6b774c20c02885d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "brand_translations" DROP CONSTRAINT "FK_1b2c9801cdefca32f03214285d9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "category_attributes" DROP CONSTRAINT "FK_6730826326fa81ff5511cb0981a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "category_attributes" DROP CONSTRAINT "FK_55050a8a1b2d2f5202f226d4ac1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attribute_value_translations" DROP CONSTRAINT "FK_410e7e5753e3f567d7d61b4613d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attribute_values" DROP CONSTRAINT "FK_be02d0f6a15bc7a0d835f832b62"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attribute_translations" DROP CONSTRAINT "FK_2583b3debdb3b08665739a485c6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "category_translations" DROP CONSTRAINT "FK_87902f79e775e1c1b0082201d7e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" DROP CONSTRAINT "FK_88cea2dc9c31951d06437879b40"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_78f1c9690ce4f4fa12167b1b1c2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_members" DROP CONSTRAINT "FK_63045f9c571e25f19f3b4256e38"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_members" DROP CONSTRAINT "FK_d0d3b6ba9896e44104938d7c705"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_integration_mappings" DROP CONSTRAINT "FK_2727b00bff7fdd22056a83c7129"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_integrations" DROP CONSTRAINT "FK_b567dfcc0aacfd7e1cc6429d1ae"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_followers" DROP CONSTRAINT "FK_9fd05625f8610fd308f072cba22"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_followers" DROP CONSTRAINT "FK_0cf0b8f1c9b56d5458996369198"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_translations" DROP CONSTRAINT "FK_be516cd138f3a6318fb7b17dddb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_bank_accounts" DROP CONSTRAINT "FK_94e674d49212d992777ba20b8fb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_documents" DROP CONSTRAINT "FK_0a0e3fccb9f2d9977aad9b3956a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_documents" DROP CONSTRAINT "FK_218ad2aece37d1c3bf7cfe6c72f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "recent_searches" DROP CONSTRAINT "FK_40e066371156ac8b5fed746b439"`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_searches" DROP CONSTRAINT "FK_8f01d13ac8e7b451d244674274f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "recently_viewed" DROP CONSTRAINT "FK_72ecdebddea783ebe1ef655bbd0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "recently_viewed" DROP CONSTRAINT "FK_f38a305eb7ef25073319b20f552"`,
    );
    await queryRunner.query(
      `ALTER TABLE "recently_viewed" DROP CONSTRAINT "FK_13c5b56da6d00c32cb4c0764a0e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "guest_sessions" DROP CONSTRAINT "FK_ca25eb82ca26487173e561cebba"`,
    );
    await queryRunner.query(
      `ALTER TABLE "newsletter_subscribers" DROP CONSTRAINT "FK_dcd5c5b83f0fba1ccef75e09a4c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_preferences" DROP CONSTRAINT "FK_64c90edc7310c6be7c10c96f675"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "FK_9a8a82462cab47c73d25f49261f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_two_factor" DROP CONSTRAINT "FK_0e865d85e0ad6329b40523afe55"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_tokens" DROP CONSTRAINT "FK_9e144a67be49e5bba91195ef5de"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_sessions" DROP CONSTRAINT "FK_e9658e959c490b0a634dfc54783"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_verified_phones" DROP CONSTRAINT "FK_94143735b8eb744a002a1d42d25"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_addresses" DROP CONSTRAINT "FK_7a5100ce0548ef27a6f1533a5ce"`,
    );
    await queryRunner.query(`DROP TABLE "rules_epoch"`);
    await queryRunner.query(`DROP INDEX "public"."channel_deliveries_channel_created_idx"`);
    await queryRunner.query(`DROP TABLE "channel_deliveries"`);
    await queryRunner.query(`DROP TYPE "public"."channel_deliveries_kind_enum"`);
    await queryRunner.query(`DROP INDEX "public"."channel_feed_runs_channel_created_idx"`);
    await queryRunner.query(`DROP TABLE "channel_feed_runs"`);
    await queryRunner.query(`DROP INDEX "public"."channel_category_mappings_uq"`);
    await queryRunner.query(`DROP TABLE "channel_category_mappings"`);
    await queryRunner.query(`DROP INDEX "public"."channel_listings_offer_variant_uq"`);
    await queryRunner.query(`DROP INDEX "public"."channel_listings_offer_base_uq"`);
    await queryRunner.query(`DROP INDEX "public"."channel_listings_review_idx"`);
    await queryRunner.query(`DROP TABLE "channel_listings"`);
    await queryRunner.query(`DROP TYPE "public"."channel_listings_review_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."channel_listings_sync_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."sales_channels_code_uq"`);
    await queryRunner.query(`DROP TABLE "sales_channels"`);
    await queryRunner.query(`DROP TYPE "public"."sales_channels_code_enum"`);
    await queryRunner.query(`DROP INDEX "public"."idx_bulk_export_jobs_vendor_created"`);
    await queryRunner.query(`DROP INDEX "public"."idx_bulk_export_jobs_user_created"`);
    await queryRunner.query(`DROP INDEX "public"."idx_bulk_export_jobs_status"`);
    await queryRunner.query(`DROP TABLE "bulk_export_jobs"`);
    await queryRunner.query(`DROP TYPE "public"."product_export_preset_enum"`);
    await queryRunner.query(`DROP TYPE "public"."bulk_export_file_format_enum"`);
    await queryRunner.query(`DROP TYPE "public"."user_role"`);
    await queryRunner.query(`DROP TYPE "public"."bulk_export_job_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."bulk_export_job_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_7da7de42633eda5b1cf937e137"`);
    await queryRunner.query(`DROP TABLE "bulk_import_job_image_tasks"`);
    await queryRunner.query(`DROP TYPE "public"."bulk_import_job_image_tasks_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_8174bcbffdbd39763c53de2732"`);
    await queryRunner.query(`DROP TABLE "bulk_import_job_row_changes"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e61a72ce0735a50282518a584d"`);
    await queryRunner.query(`DROP TABLE "bulk_import_job_row_errors"`);
    await queryRunner.query(`DROP TABLE "bulk_import_jobs"`);
    await queryRunner.query(`DROP TYPE "public"."bulk_import_jobs_file_format_enum"`);
    await queryRunner.query(`DROP TYPE "public"."bulk_import_jobs_import_mode_enum"`);
    await queryRunner.query(`DROP TYPE "public"."bulk_import_jobs_strictness_enum"`);
    await queryRunner.query(`DROP TYPE "public"."bulk_import_jobs_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."bulk_import_jobs_job_type_enum"`);
    await queryRunner.query(`DROP TABLE "section_bid_slots"`);
    await queryRunner.query(`DROP TABLE "section_bids"`);
    await queryRunner.query(`DROP TYPE "public"."section_bids_status_enum"`);
    await queryRunner.query(`DROP TABLE "layout_sections"`);
    await queryRunner.query(`DROP TYPE "public"."layout_sections_source_mode_enum"`);
    await queryRunner.query(`DROP TABLE "layout_versions"`);
    await queryRunner.query(`DROP TABLE "page_layouts"`);
    await queryRunner.query(`DROP TYPE "public"."page_layouts_status_enum"`);
    await queryRunner.query(`DROP TABLE "section_types"`);
    await queryRunner.query(`DROP TABLE "cart_abandoned"`);
    await queryRunner.query(`DROP TABLE "support_messages"`);
    await queryRunner.query(`DROP INDEX "public"."idx_support_tickets_slack_thread"`);
    await queryRunner.query(`DROP INDEX "public"."idx_support_tickets_guest_session"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_9113dc95d29b23ab6abe8b94d5"`);
    await queryRunner.query(`DROP TABLE "support_tickets"`);
    await queryRunner.query(`DROP TYPE "public"."support_tickets_priority_enum"`);
    await queryRunner.query(`DROP TYPE "public"."support_tickets_status_enum"`);
    await queryRunner.query(`DROP TABLE "header_navigation_configs"`);
    await queryRunner.query(`DROP TABLE "banners"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c515459aa43b0485dc3d0c4ab1"`);
    await queryRunner.query(`DROP TABLE "pages"`);
    await queryRunner.query(`DROP TYPE "public"."pages_status_enum"`);
    await queryRunner.query(`DROP TABLE "audit_log"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_6ff6ede58b63767ee813eb94a9"`);
    await queryRunner.query(`DROP TABLE "site_settings"`);
    await queryRunner.query(`DROP INDEX "public"."vendor_carrier_accounts_vendor_idx"`);
    await queryRunner.query(`DROP INDEX "public"."vendor_carrier_accounts_vendor_provider_uq"`);
    await queryRunner.query(`DROP INDEX "public"."vendor_carrier_accounts_platform_provider_uq"`);
    await queryRunner.query(`DROP TABLE "vendor_carrier_accounts"`);
    await queryRunner.query(`DROP INDEX "public"."shipping_providers_code_uq"`);
    await queryRunner.query(`DROP TABLE "shipping_providers"`);
    await queryRunner.query(`DROP TABLE "shipping_contribution_tiers"`);
    await queryRunner.query(`DROP TABLE "shipping_rates"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_86836140df407cb2436f1e0fc3"`);
    await queryRunner.query(`DROP TABLE "delivery_zones"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_9dcf949717f80df916d4121b8c"`);
    await queryRunner.query(`DROP TABLE "product_collection_members"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_903616ff5ddd9908f81e070215"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_8819ef954194e70538422cb6d4"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_1ddc65ebe1ca9b257bcc2db3d1"`);
    await queryRunner.query(`DROP TABLE "product_collection_items"`);
    await queryRunner.query(`DROP TYPE "public"."product_collection_items_role_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_effc3237374fb4159da228a299"`);
    await queryRunner.query(`DROP TABLE "product_collections"`);
    await queryRunner.query(`DROP TYPE "public"."product_collections_default_sort_enum"`);
    await queryRunner.query(`DROP TYPE "public"."product_collections_kind_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_aa4489e0125b5e98527daab4e8"`);
    await queryRunner.query(`DROP TABLE "coupon_usages"`);
    await queryRunner.query(`DROP TABLE "coupon_user_restrictions"`);
    await queryRunner.query(`DROP TABLE "coupon_excluded_products"`);
    await queryRunner.query(`DROP TABLE "coupon_vendors"`);
    await queryRunner.query(`DROP TABLE "coupon_categories"`);
    await queryRunner.query(`DROP TABLE "coupon_products"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_59adfb33ba6cd163693d55828e"`);
    await queryRunner.query(`DROP TABLE "coupons"`);
    await queryRunner.query(`DROP TYPE "public"."coupons_applicable_to_enum"`);
    await queryRunner.query(`DROP TYPE "public"."coupons_type_enum"`);
    await queryRunner.query(`DROP TABLE "review_votes"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_13f213a81d0dcf865e5a9306a1"`);
    await queryRunner.query(`DROP TABLE "reviews"`);
    await queryRunner.query(`DROP TYPE "public"."reviews_status_enum"`);
    await queryRunner.query(`DROP TABLE "payment_method_thresholds"`);
    await queryRunner.query(`DROP TABLE "wallet_transactions"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_fa6be81c82219a4d8fcb87d73c"`);
    await queryRunner.query(`DROP TABLE "vendor_payout_adjustments"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_dcddca06ee5d705e0aedb1d09b"`);
    await queryRunner.query(`DROP TABLE "vendor_payouts"`);
    await queryRunner.query(`DROP TYPE "public"."vendor_payouts_payout_rail_enum"`);
    await queryRunner.query(`DROP TYPE "public"."vendor_payouts_status_enum"`);
    await queryRunner.query(`DROP TABLE "commissions"`);
    await queryRunner.query(`DROP TYPE "public"."commissions_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."commissions_commission_type_enum"`);
    await queryRunner.query(`DROP TABLE "tax_rates"`);
    await queryRunner.query(`DROP TABLE "webhook_events"`);
    await queryRunner.query(`DROP TYPE "public"."webhook_events_status_enum"`);
    await queryRunner.query(`DROP TABLE "payments"`);
    await queryRunner.query(`DROP TYPE "public"."payments_payment_method_enum"`);
    await queryRunner.query(`DROP TYPE "public"."payments_status_enum"`);
    await queryRunner.query(`DROP TABLE "dispute_messages"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_b2b0a876e8ca60365d9586efcc"`);
    await queryRunner.query(`DROP TABLE "disputes"`);
    await queryRunner.query(`DROP TYPE "public"."disputes_status_enum"`);
    await queryRunner.query(`DROP TABLE "return_items"`);
    await queryRunner.query(`DROP TYPE "public"."return_items_reason_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_1a49224595b601bf4b9328cd9e"`);
    await queryRunner.query(`DROP TABLE "returns"`);
    await queryRunner.query(`DROP TYPE "public"."returns_reason_enum"`);
    await queryRunner.query(`DROP TYPE "public"."returns_status_enum"`);
    await queryRunner.query(`DROP TABLE "shipment_status_history"`);
    await queryRunner.query(`DROP TYPE "public"."shipment_status_history_to_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."shipment_status_history_from_status_enum"`);
    await queryRunner.query(`DROP TABLE "shipment_items"`);
    await queryRunner.query(`DROP TABLE "shipment_events"`);
    await queryRunner.query(`DROP TYPE "public"."shipment_events_status_enum"`);
    await queryRunner.query(`DROP TABLE "shipments"`);
    await queryRunner.query(`DROP TYPE "public"."shipments_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_10a14db799cf39d34c99b93685"`);
    await queryRunner.query(`DROP TABLE "order_item_cancellations"`);
    await queryRunner.query(`DROP TABLE "order_status_history"`);
    await queryRunner.query(`DROP TABLE "order_items"`);
    await queryRunner.query(`DROP TYPE "public"."order_items_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_7aedded21669e72423d3e88b94"`);
    await queryRunner.query(`DROP TABLE "vendor_orders"`);
    await queryRunner.query(`DROP TYPE "public"."vendor_orders_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_235d1d1767c7d286e38859f499"`);
    await queryRunner.query(`DROP TABLE "orders"`);
    await queryRunner.query(`DROP TYPE "public"."orders_payment_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."orders_status_enum"`);
    await queryRunner.query(`DROP TABLE "price_history"`);
    await queryRunner.query(`DROP TABLE "product_questions"`);
    await queryRunner.query(`DROP TABLE "bundle_items"`);
    await queryRunner.query(`DROP TABLE "product_bundles"`);
    await queryRunner.query(`DROP TABLE "product_relations"`);
    await queryRunner.query(`DROP TYPE "public"."product_relations_type_enum"`);
    await queryRunner.query(`DROP TABLE "cart_items"`);
    await queryRunner.query(`DROP TABLE "carts"`);
    await queryRunner.query(`DROP TABLE "wishlists"`);
    await queryRunner.query(`DROP TABLE "product_attribute_values"`);
    await queryRunner.query(`DROP TABLE "inventory_reservations"`);
    await queryRunner.query(`DROP TYPE "public"."inventory_reservations_status_enum"`);
    await queryRunner.query(`DROP TABLE "inventory_movements"`);
    await queryRunner.query(`DROP INDEX "public"."uq_inventory_product_variant_warehouse_active"`);
    await queryRunner.query(`DROP TABLE "inventory"`);
    await queryRunner.query(`DROP INDEX "public"."uq_warehouse_vendor_permissions_active"`);
    await queryRunner.query(`DROP TABLE "warehouse_vendor_permissions"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_5700614c802ce8826767c27879"`);
    await queryRunner.query(`DROP TABLE "warehouses"`);
    await queryRunner.query(`DROP TABLE "product_group_members"`);
    await queryRunner.query(`DROP TABLE "product_groups"`);
    await queryRunner.query(`DROP TYPE "public"."product_groups_listing_mode_enum"`);
    await queryRunner.query(`DROP TABLE "product_variants"`);
    await queryRunner.query(`DROP TABLE "product_videos"`);
    await queryRunner.query(`DROP TABLE "product_images"`);
    await queryRunner.query(`DROP TABLE "product_categories"`);
    await queryRunner.query(`DROP TABLE "product_translations"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_f397896d12122c7d973f569449"`);
    await queryRunner.query(`DROP TABLE "products"`);
    await queryRunner.query(`DROP TYPE "public"."products_status_enum"`);
    await queryRunner.query(`DROP TABLE "brand_translations"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_6e84db132e36cfff216facdba7"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_22b36048ad23b21bab6966008b"`);
    await queryRunner.query(`DROP TABLE "brands"`);
    await queryRunner.query(`DROP TYPE "public"."brands_status_enum"`);
    await queryRunner.query(`DROP TABLE "category_attributes"`);
    await queryRunner.query(`DROP TABLE "attribute_value_translations"`);
    await queryRunner.query(`DROP TABLE "attribute_values"`);
    await queryRunner.query(`DROP TABLE "attribute_translations"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_088ed3a4aaabe23a6bca1d3290"`);
    await queryRunner.query(`DROP TABLE "attributes"`);
    await queryRunner.query(`DROP TYPE "public"."attributes_filter_input_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."attributes_type_enum"`);
    await queryRunner.query(`DROP TABLE "category_translations"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_61720ee48ef901a7a228b06b04"`);
    await queryRunner.query(`DROP TABLE "categories"`);
    await queryRunner.query(`DROP TABLE "role_permissions"`);
    await queryRunner.query(`DROP TYPE "public"."role_permissions_role_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_d0d3b6ba9896e44104938d7c70"`);
    await queryRunner.query(`DROP TABLE "vendor_members"`);
    await queryRunner.query(`DROP TYPE "public"."vendor_members_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."vendor_members_role_enum"`);
    await queryRunner.query(`DROP INDEX "public"."vipw_status_idx"`);
    await queryRunner.query(`DROP TABLE "vendor_integration_pending_writes"`);
    await queryRunner.query(`DROP INDEX "public"."vid_integration_created_idx"`);
    await queryRunner.query(`DROP INDEX "public"."vid_idempotency_uq"`);
    await queryRunner.query(`DROP TABLE "vendor_integration_deliveries"`);
    await queryRunner.query(`DROP TYPE "public"."vendor_integration_deliveries_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."vendor_integration_deliveries_direction_enum"`);
    await queryRunner.query(`DROP TYPE "public"."vendor_integration_deliveries_event_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."vendor_integration_mappings_uq"`);
    await queryRunner.query(`DROP TABLE "vendor_integration_mappings"`);
    await queryRunner.query(`DROP TYPE "public"."vendor_integration_mappings_direction_enum"`);
    await queryRunner.query(`DROP TYPE "public"."vendor_integration_mappings_event_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."vendor_integrations_active_uq"`);
    await queryRunner.query(`DROP TABLE "vendor_integrations"`);
    await queryRunner.query(`DROP TYPE "public"."vendor_integrations_pricing_authority_enum"`);
    await queryRunner.query(`DROP TYPE "public"."vendor_integrations_inventory_authority_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_9fd05625f8610fd308f072cba2"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_0cf0b8f1c9b56d545899636919"`);
    await queryRunner.query(`DROP TABLE "vendor_followers"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_be516cd138f3a6318fb7b17ddd"`);
    await queryRunner.query(`DROP TABLE "vendor_translations"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_94e674d49212d992777ba20b8f"`);
    await queryRunner.query(`DROP TABLE "vendor_bank_accounts"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_218ad2aece37d1c3bf7cfe6c72"`);
    await queryRunner.query(`DROP TABLE "vendor_documents"`);
    await queryRunner.query(`DROP TYPE "public"."vendor_documents_type_enum"`);
    await queryRunner.query(`DROP TABLE "vendor_ai_usage"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_750a10541e8f8048d076bed731"`);
    await queryRunner.query(`DROP TABLE "vendors"`);
    await queryRunner.query(`DROP TYPE "public"."vendors_commission_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."vendors_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_566b01af8b6063d48a27626679"`);
    await queryRunner.query(`DROP TABLE "recent_searches"`);
    await queryRunner.query(`DROP TABLE "saved_searches"`);
    await queryRunner.query(`DROP TABLE "recently_viewed"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_156ffe6484249f432cd081eff3"`);
    await queryRunner.query(`DROP TABLE "guest_sessions"`);
    await queryRunner.query(`DROP TABLE "newsletter_subscribers"`);
    await queryRunner.query(`DROP TABLE "notification_preferences"`);
    await queryRunner.query(`DROP TYPE "public"."notification_preferences_channel_enum"`);
    await queryRunner.query(`DROP TYPE "public"."notification_preferences_notification_type_enum"`);
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(`DROP TYPE "public"."notifications_channel_enum"`);
    await queryRunner.query(`DROP TYPE "public"."notifications_type_enum"`);
    await queryRunner.query(`DROP TABLE "user_two_factor"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_8439498e5cddde50e3b87c5134"`);
    await queryRunner.query(`DROP TABLE "user_tokens"`);
    await queryRunner.query(`DROP TYPE "public"."user_tokens_type_enum"`);
    await queryRunner.query(`DROP TABLE "user_sessions"`);
    await queryRunner.query(`DROP INDEX "public"."uq_user_verified_phone"`);
    await queryRunner.query(`DROP TABLE "user_verified_phones"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_d1c8d069847e5ae1783ef6e7ed"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_733a1b0ce482d8dad7fdfaf652"`);
    await queryRunner.query(`DROP TABLE "phone_auth_challenges"`);
    await queryRunner.query(`DROP TABLE "user_addresses"`);
    await queryRunner.query(`DROP TYPE "public"."user_addresses_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_b383987bfa6e6a8745085621d0"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
  }
}
