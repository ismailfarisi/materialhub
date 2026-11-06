import {
  Check,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { BusinessVerificationStatus } from "../enums.ts";
import type { BusinessCreditAccount } from "./business-credit-account.entity.ts";
import type { BusinessMember } from "./business-member.entity.ts";

export interface BusinessBillingAddress {
  line1: string;
  line2?: string | null;
  city: string;
  emirate: string;
  po_box?: string | null;
  country_code: string;
}

/**
 * A company buying on MaterialHub (roadmap item 4). Users join through
 * `business_members`; one user has at most one active membership.
 */
@Entity("business_accounts")
@Check("chk_business_accounts_trn_format", `"trn" IS NULL OR "trn" ~ '^[0-9]{15}$'`)
export class BusinessAccount {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  /** Legal name exactly as on the trade licence. Printed on tax invoices. */
  @Column({ type: "varchar", length: 255 })
  legal_name!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  trade_name!: string | null;

  @Column({ type: "varchar", length: 100 })
  trade_licence_number!: string;

  /** Issuing authority, e.g. "Dubai DET", "ADDED", a free-zone authority. */
  @Column({ type: "varchar", length: 100, nullable: true })
  trade_licence_issuer!: string | null;

  @Column({ type: "date" })
  trade_licence_expiry!: string;

  /** S3 key under private/business/<userId>/, uploaded via /media/presign. */
  @Column({ type: "varchar", length: 1024, nullable: true })
  trade_licence_document_key!: string | null;

  @Column({ type: "boolean", default: true })
  vat_registered!: boolean;

  /** UAE Tax Registration Number, 15 digits. Null when not VAT-registered. */
  @Index()
  @Column({ type: "varchar", length: 15, nullable: true })
  trn!: string | null;

  /** Derived from the TRN: "0235:<first 10 digits>". See trn.ts. */
  @Column({ type: "varchar", length: 50, nullable: true })
  peppol_participant_id!: string | null;

  @Column({ type: "jsonb" })
  billing_address!: BusinessBillingAddress;

  @Index()
  @Column({
    type: "enum",
    enum: BusinessVerificationStatus,
    enumName: "business_verification_status_enum",
    default: BusinessVerificationStatus.pending,
  })
  verification_status!: BusinessVerificationStatus;

  @Column({ type: "timestamptz", nullable: true })
  verified_at!: Date | null;

  @Column({ type: "uuid", nullable: true })
  verified_by!: string | null;

  @Column({ type: "text", nullable: true })
  rejection_reason!: string | null;

  /**
   * Orders by a `buyer` member above this total (fils, VAT inclusive) need an
   * approver's sign-off. Null = no approval step.
   */
  @Column({ type: "integer", nullable: true })
  approval_threshold_fils!: number | null;

  @Column({ type: "uuid" })
  created_by!: string;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;

  @OneToMany("BusinessMember", "businessAccount")
  members!: BusinessMember[];

  @OneToOne("BusinessCreditAccount", "businessAccount")
  credit!: BusinessCreditAccount | null;
}
