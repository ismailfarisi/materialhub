import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { NetTermsPeriod, NetTermsStatus } from "../enums.ts";
import type { BusinessAccount } from "./business-account.entity.ts";

/**
 * Net terms ("pay on invoice") for a business account. One row per account,
 * created when the business applies. `outstanding_fils` is changed only
 * inside a transaction holding `SELECT ... FOR UPDATE` on this row.
 */
@Entity("business_credit_accounts")
@Check("chk_business_credit_outstanding_nonneg", `"outstanding_fils" >= 0`)
@Check("chk_business_credit_limit_nonneg", `"credit_limit_fils" >= 0`)
export class BusinessCreditAccount {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid", unique: true })
  business_account_id!: string;

  @OneToOne("BusinessAccount", "credit")
  @JoinColumn({ name: "business_account_id" })
  businessAccount!: BusinessAccount;

  @Column({
    type: "enum",
    enum: NetTermsPeriod,
    enumName: "net_terms_period_enum",
    default: NetTermsPeriod.net_30,
  })
  terms!: NetTermsPeriod;

  @Column({
    type: "enum",
    enum: NetTermsStatus,
    enumName: "net_terms_status_enum",
    default: NetTermsStatus.applied,
  })
  status!: NetTermsStatus;

  @Column({ type: "integer", nullable: true })
  requested_limit_fils!: number | null;

  @Column({ type: "integer", default: 0 })
  credit_limit_fils!: number;

  /** Sum of unpaid net-terms order totals. */
  @Column({ type: "integer", default: 0 })
  outstanding_fils!: number;

  @Column({ type: "text", nullable: true })
  application_note!: string | null;

  @Column({ type: "uuid", nullable: true })
  applied_by!: string | null;

  @Column({ type: "timestamptz", default: () => "now()" })
  applied_at!: Date;

  @Column({ type: "uuid", nullable: true })
  decided_by!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  decided_at!: Date | null;

  @Column({ type: "text", nullable: true })
  decision_note!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;
}
