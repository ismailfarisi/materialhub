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
import type { VendorPayout } from "./vendor-payout.entity.ts";
import type { Vendor } from "./vendor.entity.ts";

/**
 * Signed ledger of corrections against a vendor's payout balance.
 *
 * A negative `amount_fils` is a clawback — money already transferred to the
 * vendor that must net against a future payout (e.g. a return refunded after
 * the commission was paid). A positive value is a credit.
 *
 * Claimed by a draft payout via `settled_payout_id`, mirroring the mechanism
 * already used for `reel_license_escrow_holds`.
 */
@Entity("vendor_payout_adjustments")
export class VendorPayoutAdjustment {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "uuid" })
  vendor_id!: string;

  @ManyToOne("Vendor")
  @JoinColumn({ name: "vendor_id" })
  vendor!: Vendor;

  /** Signed. Negative = clawback from the vendor. Always fils. */
  @Column({ type: "integer" })
  amount_fils!: number;

  @Column({ type: "varchar", length: 255 })
  reason!: string;

  /** e.g. "return", "dispute", "item_cancellation", "manual" */
  @Column({ type: "varchar", length: 50 })
  source_type!: string;

  @Column({ type: "uuid", nullable: true })
  source_id!: string | null;

  @Column({ type: "uuid", nullable: true })
  settled_payout_id!: string | null;

  @ManyToOne("VendorPayout")
  @JoinColumn({ name: "settled_payout_id" })
  settledPayout!: VendorPayout | null;

  @Column({ type: "uuid", nullable: true })
  created_by!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz" })
  deleted_at!: Date | null;
}
