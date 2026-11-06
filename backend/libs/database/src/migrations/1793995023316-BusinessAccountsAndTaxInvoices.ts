import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Workstream 3: business accounts, net terms, VAT tax invoices.
 *
 * - business_accounts, business_members, business_credit_accounts,
 *   business_order_approvals
 * - tax_invoices (the structured, Peppol-ready invoice record) and
 *   invoice_number_sequences (per-seller, per-year numbering)
 * - vendors.trn (+ verification), backfilled from vendors.vat_number where it
 *   already holds a 15-digit TRN
 * - orders.business_account_id / buyer_trn / payment_terms / payment_due_at
 * - payments_payment_method_enum gains 'net_terms' (ADD VALUE, so it does not
 *   rewrite the type other workstreams may also extend)
 */

export class BusinessAccountsAndTaxInvoices1793995023316 implements MigrationInterface {
  name = "BusinessAccountsAndTaxInvoices1793995023316";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."business_verification_status_enum" AS ENUM('pending', 'verified', 'rejected')`,
    );
    await queryRunner.query(
      `CREATE TABLE "business_accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "legal_name" character varying(255) NOT NULL, "trade_name" character varying(255), "trade_licence_number" character varying(100) NOT NULL, "trade_licence_issuer" character varying(100), "trade_licence_expiry" date NOT NULL, "trade_licence_document_key" character varying(1024), "vat_registered" boolean NOT NULL DEFAULT true, "trn" character varying(15), "peppol_participant_id" character varying(50), "billing_address" jsonb NOT NULL, "verification_status" "public"."business_verification_status_enum" NOT NULL DEFAULT 'pending', "verified_at" TIMESTAMP WITH TIME ZONE, "verified_by" uuid, "rejection_reason" text, "approval_threshold_fils" integer, "created_by" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_f375eab37ba95b445041794b721" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ad6c10a409bd9d3c54dc017dd3" ON "business_accounts" ("trn") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_328169c8a19c256543cbc95361" ON "business_accounts" ("verification_status") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."business_member_role_enum" AS ENUM('admin', 'approver', 'buyer')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."business_member_status_enum" AS ENUM('invited', 'active', 'removed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "business_members" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "business_account_id" uuid NOT NULL, "user_id" uuid, "email" character varying(255) NOT NULL, "role" "public"."business_member_role_enum" NOT NULL DEFAULT 'buyer', "status" "public"."business_member_status_enum" NOT NULL DEFAULT 'invited', "invited_by" uuid, "invited_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "joined_at" TIMESTAMP WITH TIME ZONE, "removed_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_0665f675783d42efe8fb5e5697c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3a4f80fbafccbca3e20dacd390" ON "business_members" ("business_account_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_business_members_account_email" ON "business_members" ("business_account_id", "email") WHERE status <> 'removed'`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_business_members_active_user" ON "business_members" ("user_id") WHERE status = 'active'`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."net_terms_period_enum" AS ENUM('net_30', 'net_60')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."net_terms_status_enum" AS ENUM('applied', 'approved', 'rejected', 'suspended')`,
    );
    await queryRunner.query(
      `CREATE TABLE "business_credit_accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "business_account_id" uuid NOT NULL, "terms" "public"."net_terms_period_enum" NOT NULL DEFAULT 'net_30', "status" "public"."net_terms_status_enum" NOT NULL DEFAULT 'applied', "requested_limit_fils" integer, "credit_limit_fils" integer NOT NULL DEFAULT '0', "outstanding_fils" integer NOT NULL DEFAULT '0', "application_note" text, "applied_by" uuid, "applied_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "decided_by" uuid, "decided_at" TIMESTAMP WITH TIME ZONE, "decision_note" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_b4a6806882debfdb06779a66335" UNIQUE ("business_account_id"), CONSTRAINT "REL_b4a6806882debfdb06779a6633" UNIQUE ("business_account_id"), CONSTRAINT "chk_business_credit_limit_nonneg" CHECK ("credit_limit_fils" >= 0), CONSTRAINT "chk_business_credit_outstanding_nonneg" CHECK ("outstanding_fils" >= 0), CONSTRAINT "PK_bf8d469b6df12359eed5382f054" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."business_order_approval_status_enum" AS ENUM('pending', 'approved', 'rejected', 'used', 'expired', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TABLE "business_order_approvals" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "business_account_id" uuid NOT NULL, "requested_by" uuid NOT NULL, "cart_hash" character varying(128) NOT NULL, "amount_fils" integer NOT NULL, "currency" character(3) NOT NULL DEFAULT 'AED', "items_snapshot" jsonb NOT NULL, "note" text, "status" "public"."business_order_approval_status_enum" NOT NULL DEFAULT 'pending', "decided_by" uuid, "decided_at" TIMESTAMP WITH TIME ZONE, "decision_note" text, "expires_at" TIMESTAMP WITH TIME ZONE, "order_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_076c5710f7327b7746451793184" UNIQUE ("order_id"), CONSTRAINT "PK_a857267941a4b5d9aac418ee5fa" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_52c3b3e9a4467449fcdbe3a098" ON "business_order_approvals" ("business_account_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b88c4034f82dd8386312d7492f" ON "business_order_approvals" ("requested_by") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_562dc116ef5a0b283e24c0b2a2" ON "business_order_approvals" ("status") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."tax_invoice_kind_enum" AS ENUM('vendor', 'platform')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."tax_invoice_payment_status_enum" AS ENUM('paid', 'unpaid', 'void')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."einvoice_status_enum" AS ENUM('not_applicable', 'ready', 'submitted', 'accepted', 'rejected')`,
    );
    await queryRunner.query(
      `CREATE TABLE "tax_invoices" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "invoice_number" character varying(40) NOT NULL, "kind" "public"."tax_invoice_kind_enum" NOT NULL, "type_code" character varying(3) NOT NULL DEFAULT '380', "order_id" uuid NOT NULL, "vendor_order_id" uuid, "vendor_id" uuid, "buyer_user_id" uuid NOT NULL, "business_account_id" uuid, "issue_date" date NOT NULL, "supply_date" date, "due_date" date, "currency" character(3) NOT NULL DEFAULT 'AED', "seller" jsonb NOT NULL, "buyer" jsonb NOT NULL, "lines" jsonb NOT NULL, "allowances_charges" jsonb NOT NULL DEFAULT '[]', "vat_breakdown" jsonb NOT NULL, "line_extension_fils" integer NOT NULL, "allowance_total_fils" integer NOT NULL DEFAULT '0', "charge_total_fils" integer NOT NULL DEFAULT '0', "tax_exclusive_fils" integer NOT NULL, "vat_total_fils" integer NOT NULL, "tax_inclusive_fils" integer NOT NULL, "rounding_fils" integer NOT NULL DEFAULT '0', "payable_fils" integer NOT NULL, "payment_terms" character varying(20) NOT NULL DEFAULT 'immediate', "payment_method" character varying(30), "payment_status" "public"."tax_invoice_payment_status_enum" NOT NULL DEFAULT 'unpaid', "paid_at" TIMESTAMP WITH TIME ZONE, "einvoice_status" "public"."einvoice_status_enum" NOT NULL DEFAULT 'ready', "asp_message_id" character varying(255), "asp_submitted_at" TIMESTAMP WITH TIME ZONE, "asp_last_error" text, "pdf_s3_key" character varying(1024), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_20c3fd7cfd910b71c7d464a76db" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_607d0ead7bf59be5baf6cbbed4" ON "tax_invoices" ("invoice_number") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_41b6c745dd62376f3ebb4eee87" ON "tax_invoices" ("order_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c18277308cbc8472b1d5582f14" ON "tax_invoices" ("vendor_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ea1e94520d97adcda29c45bfcc" ON "tax_invoices" ("buyer_user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3452036477279c453fc8505ad5" ON "tax_invoices" ("business_account_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4572d44e7921127eb017fcb07c" ON "tax_invoices" ("payment_status") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_tax_invoices_platform_order" ON "tax_invoices" ("order_id") WHERE kind = 'platform'`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_tax_invoices_vendor_order" ON "tax_invoices" ("vendor_order_id") WHERE vendor_order_id IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "invoice_number_sequences" ("series" character varying(80) NOT NULL, "last_value" bigint NOT NULL DEFAULT '0', "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_0da95c18594a8158d3924b5672e" PRIMARY KEY ("series"))`,
    );
    await queryRunner.query(`ALTER TABLE "vendors" ADD "trn" character varying(15)`);
    await queryRunner.query(`ALTER TABLE "vendors" ADD "trn_verified_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "vendors" ADD "trn_verified_by" uuid`);
    await queryRunner.query(`ALTER TABLE "orders" ADD "business_account_id" uuid`);
    await queryRunner.query(`ALTER TABLE "orders" ADD "buyer_trn" character varying(15)`);
    await queryRunner.query(`ALTER TABLE "orders" ADD "payment_terms" character varying(10)`);
    await queryRunner.query(`ALTER TABLE "orders" ADD "payment_due_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(
      `CREATE INDEX "IDX_63cdc13ab8f8dc4a58a9492b2a" ON "orders" ("business_account_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "business_members" ADD CONSTRAINT "FK_3a4f80fbafccbca3e20dacd390f" FOREIGN KEY ("business_account_id") REFERENCES "business_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "business_members" ADD CONSTRAINT "FK_7a8eebc9f4792ffdc2d350643fe" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "business_credit_accounts" ADD CONSTRAINT "FK_b4a6806882debfdb06779a66335" FOREIGN KEY ("business_account_id") REFERENCES "business_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "business_order_approvals" ADD CONSTRAINT "FK_52c3b3e9a4467449fcdbe3a0987" FOREIGN KEY ("business_account_id") REFERENCES "business_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."payments_payment_method_enum" ADD VALUE IF NOT EXISTS 'net_terms'`,
    );
    await queryRunner.query(
      `UPDATE "vendors" SET "trn" = regexp_replace("vat_number", '\\s', '', 'g') WHERE "trn" IS NULL AND "vat_number" IS NOT NULL AND regexp_replace("vat_number", '\\s', '', 'g') ~ '^[0-9]{15}$'`,
    );
    await queryRunner.query(
      `ALTER TABLE "business_accounts" ADD CONSTRAINT "chk_business_accounts_trn_format" CHECK ("trn" IS NULL OR "trn" ~ '^[0-9]{15}$')`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendors" ADD CONSTRAINT "chk_vendors_trn_format" CHECK ("trn" IS NULL OR "trn" ~ '^[0-9]{15}$')`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_payment_terms" CHECK ("payment_terms" IS NULL OR "payment_terms" IN ('net_30', 'net_60'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 'net_terms' stays in payments_payment_method_enum: Postgres cannot drop
    // an enum value, and payments rows may reference it.
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "chk_orders_payment_terms"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendors" DROP CONSTRAINT IF EXISTS "chk_vendors_trn_format"`,
    );
    await queryRunner.query(
      `ALTER TABLE "business_accounts" DROP CONSTRAINT IF EXISTS "chk_business_accounts_trn_format"`,
    );
    await queryRunner.query(
      `ALTER TABLE "business_order_approvals" DROP CONSTRAINT "FK_52c3b3e9a4467449fcdbe3a0987"`,
    );
    await queryRunner.query(
      `ALTER TABLE "business_credit_accounts" DROP CONSTRAINT "FK_b4a6806882debfdb06779a66335"`,
    );
    await queryRunner.query(
      `ALTER TABLE "business_members" DROP CONSTRAINT "FK_7a8eebc9f4792ffdc2d350643fe"`,
    );
    await queryRunner.query(
      `ALTER TABLE "business_members" DROP CONSTRAINT "FK_3a4f80fbafccbca3e20dacd390f"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_63cdc13ab8f8dc4a58a9492b2a"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "payment_due_at"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "payment_terms"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "buyer_trn"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "business_account_id"`);
    await queryRunner.query(`ALTER TABLE "vendors" DROP COLUMN "trn_verified_by"`);
    await queryRunner.query(`ALTER TABLE "vendors" DROP COLUMN "trn_verified_at"`);
    await queryRunner.query(`ALTER TABLE "vendors" DROP COLUMN "trn"`);
    await queryRunner.query(`DROP TABLE "invoice_number_sequences"`);
    await queryRunner.query(`DROP INDEX "public"."uq_tax_invoices_vendor_order"`);
    await queryRunner.query(`DROP INDEX "public"."uq_tax_invoices_platform_order"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_4572d44e7921127eb017fcb07c"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_3452036477279c453fc8505ad5"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ea1e94520d97adcda29c45bfcc"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c18277308cbc8472b1d5582f14"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_41b6c745dd62376f3ebb4eee87"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_607d0ead7bf59be5baf6cbbed4"`);
    await queryRunner.query(`DROP TABLE "tax_invoices"`);
    await queryRunner.query(`DROP TYPE "public"."einvoice_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."tax_invoice_payment_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."tax_invoice_kind_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_562dc116ef5a0b283e24c0b2a2"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_b88c4034f82dd8386312d7492f"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_52c3b3e9a4467449fcdbe3a098"`);
    await queryRunner.query(`DROP TABLE "business_order_approvals"`);
    await queryRunner.query(`DROP TYPE "public"."business_order_approval_status_enum"`);
    await queryRunner.query(`DROP TABLE "business_credit_accounts"`);
    await queryRunner.query(`DROP TYPE "public"."net_terms_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."net_terms_period_enum"`);
    await queryRunner.query(`DROP INDEX "public"."uq_business_members_active_user"`);
    await queryRunner.query(`DROP INDEX "public"."uq_business_members_account_email"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_3a4f80fbafccbca3e20dacd390"`);
    await queryRunner.query(`DROP TABLE "business_members"`);
    await queryRunner.query(`DROP TYPE "public"."business_member_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."business_member_role_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_328169c8a19c256543cbc95361"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ad6c10a409bd9d3c54dc017dd3"`);
    await queryRunner.query(`DROP TABLE "business_accounts"`);
    await queryRunner.query(`DROP TYPE "public"."business_verification_status_enum"`);
  }
}
