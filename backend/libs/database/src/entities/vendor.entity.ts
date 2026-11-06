import {
  Check,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { CommissionType, VendorStatus } from "../enums.ts";
import type { Product } from "./product.entity.ts";
import type { VendorBankAccount } from "./vendor-bank-account.entity.ts";
import type { VendorDocument } from "./vendor-document.entity.ts";
import type { VendorFollower } from "./vendor-follower.entity.ts";
import type { VendorTranslation } from "./vendor-translation.entity.ts";

// Phase 3b: vendors.user_id column was dropped. Ownership is tracked exclusively
// via the vendor_members table (active 'owner' row). To find a vendor's owner
// user, join vendor_members → users via the helpers in vendor.service.ts /
// admin-password.controller.ts.

@Entity("vendors")
@Check("chk_vendors_trn_format", `"trn" IS NULL OR "trn" ~ '^[0-9]{15}$'`)
export class Vendor {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Index({ unique: true, where: "deleted_at IS NULL" })
  @Column({ type: "varchar", length: 255, unique: true })
  slug!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "smallint", nullable: true })
  founded_year!: number | null;

  @Column({ type: "text", nullable: true })
  story!: string | null;

  @Column({ type: "varchar", length: 1024, nullable: true })
  logo_url!: string | null;

  @Column({ type: "varchar", length: 1024, nullable: true })
  banner_url!: string | null;

  @Column({ type: "jsonb", default: [] })
  cover_images!: unknown[];

  @Column({
    type: "enum",
    enum: VendorStatus,
    default: VendorStatus.pending,
  })
  status!: VendorStatus;

  @Column({ type: "timestamptz", nullable: true })
  verified_at!: Date | null;

  @Column({ type: "uuid", nullable: true })
  verified_by!: string | null;

  @Column({ type: "text", nullable: true })
  rejection_reason!: string | null;

  @Column({ type: "varchar", length: 255 })
  business_name!: string;

  @Column({ type: "varchar", length: 100 })
  business_type!: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  trade_license_number!: string | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  vat_number!: string | null;

  @Column({ type: "boolean", default: false })
  vat_registered!: boolean;

  /**
   * UAE Tax Registration Number (15 digits), printed as the seller TRN on the
   * VAT tax invoices for this vendor's sub-orders. Backfilled from
   * `vat_number` where that already held a valid TRN.
   */
  @Column({ type: "varchar", length: 15, nullable: true })
  trn!: string | null;

  /** Set by a platform admin after checking the VAT certificate. */
  @Column({ type: "timestamptz", nullable: true })
  trn_verified_at!: Date | null;

  @Column({ type: "uuid", nullable: true })
  trn_verified_by!: string | null;

  @Column({ type: "varchar", length: 255 })
  contact_email!: string;

  @Column({ type: "varchar", length: 20 })
  contact_phone!: string;

  @Column({ type: "varchar", length: 20, nullable: true })
  whatsapp!: string | null;

  @Column({ type: "varchar", length: 512, nullable: true })
  website_url!: string | null;

  @Column({ type: "jsonb", nullable: true })
  address!: Record<string, unknown> | null;

  @Column({ type: "jsonb", default: {} })
  social_links!: Record<string, unknown>;

  @Column({
    type: "enum",
    enum: CommissionType,
    nullable: true,
  })
  commission_type!: CommissionType | null;

  @Column({ type: "numeric", precision: 8, scale: 4, nullable: true })
  commission_value!: number | null;

  @Column({ type: "jsonb", nullable: true })
  commission_tiers!: unknown[] | null;

  @Column({ type: "varchar", length: 50, default: "biweekly" })
  payout_schedule!: string;

  @Column({ type: "integer", default: 10000 })
  minimum_payout!: number;

  /** Overrides the global `payout_settlement_window_days` site_setting. */
  @Column({ type: "integer", nullable: true })
  settlement_window_days!: number | null;

  @Column({ type: "boolean", default: true })
  auto_approve_orders!: boolean;

  // False until an admin approves this vendor's first service offering. Once
  // true the vendor self-publishes offerings without review. Mirrors the
  // auto_approve_orders posture above: a per-vendor trust switch, not a
  // per-record workflow.
  @Column({ type: "boolean", default: false })
  services_trusted!: boolean;

  // Opt-out: vendors ship via the platform carrier account by default.
  @Column({ type: "boolean", default: true })
  auto_create_shipment!: boolean;

  @Column({ type: "varchar", length: 100, nullable: true })
  default_carrier!: string | null;

  @Column({ type: "uuid", nullable: true })
  default_shipping_account_id!: string | null;

  @Column({ type: "smallint", default: 2 })
  processing_time_days!: number;

  @Column({ type: "smallint", nullable: true })
  response_time_hours!: number | null;

  @Column({ type: "text", nullable: true })
  return_policy!: string | null;

  @Column({ type: "text", nullable: true })
  shipping_policy!: string | null;

  @Column({ type: "numeric", precision: 3, scale: 2, default: 0 })
  rating_avg!: number;

  @Column({ type: "integer", default: 0 })
  rating_count!: number;

  @Column({ type: "numeric", precision: 14, scale: 2, default: 0 })
  total_sales!: number;

  @Column({ type: "integer", default: 0 })
  total_orders!: number;

  @Column({ type: "integer", default: 0 })
  follower_count!: number;

  @Column({ type: "boolean", default: false })
  is_featured!: boolean;

  @Column({ type: "timestamptz", nullable: true })
  featured_until!: Date | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  stripe_account_id!: string | null;

  @Column({ type: "boolean", default: false })
  charges_enabled!: boolean;

  @Column({ type: "boolean", default: false })
  payouts_enabled!: boolean;

  @Column({ type: "boolean", default: false })
  details_submitted!: boolean;

  @Column({ type: "varchar", length: 255, nullable: true })
  meta_title!: string | null;

  @Column({ type: "varchar", length: 500, nullable: true })
  meta_description!: string | null;

  @Column({ type: "boolean", default: false })
  exclude_from_channel_feeds!: boolean;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;

  @OneToMany("VendorTranslation", "vendor")
  translations!: VendorTranslation[];

  @OneToMany("VendorDocument", "vendor")
  documents!: VendorDocument[];

  @OneToMany("VendorBankAccount", "vendor")
  bankAccounts!: VendorBankAccount[];

  @OneToMany("VendorFollower", "vendor")
  followers!: VendorFollower[];

  @OneToMany("Product", "vendor")
  products!: Product[];
}
