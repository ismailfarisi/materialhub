import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { ReelLicenseFundingSource, ReelLicenseHoldStatus } from "../enums.ts";
import type { ReelLicenseOffer } from "./reel-license-offer.entity.ts";

@Entity("reel_license_escrow_holds")
export class ReelLicenseEscrowHold {
  @PrimaryGeneratedColumn("uuid") id!: string;

  @Column({ type: "uuid", nullable: true }) offer_id!: string | null;
  @ManyToOne("ReelLicenseOffer", { onDelete: "CASCADE" })
  @JoinColumn({ name: "offer_id" })
  offer?: ReelLicenseOffer;

  @Column({ type: "uuid", nullable: true }) bid_id!: string | null;
  /** Third DealLink arm (spec §7). Exactly one of offer_id / bid_id /
   *  collab_application_id is set, enforced by chk_..._link. */
  @Column({ type: "uuid", nullable: true }) collab_application_id!: string | null;

  @Column({ type: "uuid" }) vendor_id!: string;
  @Column({ type: "enum", enum: ReelLicenseFundingSource })
  funding_source!: ReelLicenseFundingSource;
  @Column({ type: "bigint" }) amount_fils!: string;
  @Column({ type: "enum", enum: ReelLicenseHoldStatus, default: ReelLicenseHoldStatus.held })
  status!: ReelLicenseHoldStatus;

  @Column({ type: "text", nullable: true }) stripe_payment_intent_id!: string | null;
  @Column({ type: "text" }) idempotency_key!: string;

  // Payout-balance settlement tracking: set when a captured payout-balance hold
  // has been netted into a vendor payout (see order-service payout.service).
  @Column({ type: "uuid", nullable: true }) settled_payout_id!: string | null;

  @Column({ type: "timestamptz", nullable: true }) captured_at!: Date | null;
  @Column({ type: "timestamptz", nullable: true }) released_at!: Date | null;

  @CreateDateColumn({ type: "timestamptz" }) created_at!: Date;
  @DeleteDateColumn({ type: "timestamptz", nullable: true }) deleted_at!: Date | null;
}
