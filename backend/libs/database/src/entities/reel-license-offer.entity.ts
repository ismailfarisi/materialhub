import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import {
  ReelLicenseFundingSource,
  ReelLicenseOfferStatus,
  ReelLicenseRightsScope,
} from "../enums.ts";
import type { Reel } from "./reel.entity.ts";

@Entity("reel_license_offers")
export class ReelLicenseOffer {
  @PrimaryGeneratedColumn("uuid") id!: string;

  @Column({ type: "uuid" }) reel_id!: string;
  @ManyToOne("Reel", { onDelete: "CASCADE" }) @JoinColumn({ name: "reel_id" }) reel?: Reel;

  @Column({ type: "uuid" }) vendor_id!: string;
  @Column({ type: "uuid" }) creator_id!: string;

  @Column({ type: "bigint" }) amount_fils!: string;
  @Column({ type: "enum", enum: ReelLicenseRightsScope }) rights_scope!: ReelLicenseRightsScope;
  @Column({ type: "enum", enum: ReelLicenseFundingSource })
  funding_source!: ReelLicenseFundingSource;
  @Column({
    type: "enum",
    enum: ReelLicenseOfferStatus,
    default: ReelLicenseOfferStatus.pending_creator,
  })
  status!: ReelLicenseOfferStatus;

  @Column({ type: "varchar", length: 10, default: "vendor" }) last_actor!:
    | "vendor"
    | "creator"
    | "system";
  @Column({ type: "timestamptz" }) expires_at!: Date;
  @Column({ type: "text", nullable: true }) message!: string | null;

  @Column({ type: "timestamptz", nullable: true }) completed_at!: Date | null;
  @Column({ type: "timestamptz", nullable: true }) declined_at!: Date | null;
  @Column({ type: "timestamptz", nullable: true }) cancelled_at!: Date | null;
  @Column({ type: "timestamptz", nullable: true }) countered_at!: Date | null;

  @CreateDateColumn({ type: "timestamptz" }) created_at!: Date;
  @UpdateDateColumn({ type: "timestamptz" }) updated_at!: Date;
  @DeleteDateColumn({ type: "timestamptz", nullable: true }) deleted_at!: Date | null;
}
