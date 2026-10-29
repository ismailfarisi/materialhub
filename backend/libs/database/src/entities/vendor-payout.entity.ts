import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { PayoutRail, PayoutStatus } from "../enums.ts";
import type { VendorBankAccount } from "./vendor-bank-account.entity.ts";
import type { Vendor } from "./vendor.entity.ts";

@Entity("vendor_payouts")
export class VendorPayout {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  vendor_id!: string;

  @ManyToOne("Vendor")
  @JoinColumn({ name: "vendor_id" })
  vendor!: Vendor;

  @Column({ type: "uuid" })
  bank_account_id!: string;

  @ManyToOne("VendorBankAccount")
  @JoinColumn({ name: "bank_account_id" })
  bankAccount!: VendorBankAccount;

  @Index({ unique: true, where: "deleted_at IS NULL" })
  @Column({ type: "varchar", length: 50, unique: true })
  payout_reference!: string;

  @Column({ type: "date" })
  period_start!: string;

  @Column({ type: "date" })
  period_end!: string;

  @Column({ type: "integer" })
  gross_amount!: number;

  @Column({ type: "integer" })
  commission_total!: number;

  @Column({ type: "integer", default: 0 })
  adjustment_total!: number;

  @Column({ type: "integer", default: 0 })
  carrier_cost_total!: number;

  // Sum of vendor_orders.shipping_contribution for this payout — the amount
  // actually deducted. carrier_cost_total is informational only.
  @Column({ type: "integer", default: 0 })
  shipping_contribution_total!: number;

  @Column({ type: "integer" })
  net_amount!: number;

  @Column({ type: "char", length: 3, default: "AED" })
  currency!: string;

  @Column({ type: "enum", enum: PayoutStatus, default: PayoutStatus.pending })
  status!: PayoutStatus;

  /**
   * NULL while the payout is a `pending` draft — the rail is chosen when the
   * admin pays, not when the draft is generated. Stamped by
   * PayoutService.approveDraft.
   */
  @Column({ type: "enum", enum: PayoutRail, nullable: true })
  payout_rail!: PayoutRail | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  gateway_reference!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  processed_at!: Date | null;

  @Column({ type: "text", nullable: true })
  notes!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
