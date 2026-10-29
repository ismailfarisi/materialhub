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
import { AffiliateLinkTargetType } from "../enums.ts";
import type { VendorAffiliate } from "./vendor-affiliate.entity.ts";

@Entity("affiliate_links")
export class AffiliateLink {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "uuid" })
  vendor_affiliate_id!: string;

  @ManyToOne("VendorAffiliate")
  @JoinColumn({ name: "vendor_affiliate_id" })
  vendor_affiliate!: VendorAffiliate;

  @Column({ type: "enum", enum: AffiliateLinkTargetType })
  target_type!: AffiliateLinkTargetType;

  @Column({ type: "uuid", nullable: true })
  target_id!: string | null;

  @Column({ type: "varchar", length: 500, nullable: true })
  target_url!: string | null;

  @Index({ unique: true, where: "deleted_at IS NULL" })
  @Column({ type: "varchar", length: 50, unique: true })
  slug!: string;

  @Column({ type: "integer", default: 0 })
  click_count!: number;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
