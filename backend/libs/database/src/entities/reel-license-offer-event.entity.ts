import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { ReelLicenseEventType } from "../enums.ts";
import type { ReelLicenseOffer } from "./reel-license-offer.entity.ts";

/** Append-only negotiation/audit trail for a license offer. No soft delete (immutable log). */
@Entity("reel_license_offer_events")
export class ReelLicenseOfferEvent {
  @PrimaryGeneratedColumn("uuid") id!: string;

  @Column({ type: "uuid" }) offer_id!: string;
  @ManyToOne("ReelLicenseOffer", { onDelete: "CASCADE" })
  @JoinColumn({ name: "offer_id" })
  offer?: ReelLicenseOffer;

  @Column({ type: "varchar", length: 10 }) actor!: "vendor" | "creator" | "system";
  @Column({ type: "enum", enum: ReelLicenseEventType }) event_type!: ReelLicenseEventType;
  @Column({ type: "bigint", nullable: true }) amount_fils_snapshot!: string | null;
  @Column({ type: "text", nullable: true }) note!: string | null;

  @CreateDateColumn({ type: "timestamptz" }) created_at!: Date;
}
