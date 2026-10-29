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
import { AffiliateCommissionType, VendorAffiliateStatus } from "../enums.ts";
import type { User } from "./user.entity.ts";
import type { Vendor } from "./vendor.entity.ts";

@Entity("vendor_affiliates")
export class VendorAffiliate {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "uuid" })
  vendor_id!: string;

  @ManyToOne("Vendor")
  @JoinColumn({ name: "vendor_id" })
  vendor!: Vendor;

  @Column({ type: "uuid", nullable: true })
  user_id!: string | null;

  @ManyToOne("User", { nullable: true })
  @JoinColumn({ name: "user_id" })
  user!: User | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  invite_email!: string | null;

  @Column({ type: "enum", enum: VendorAffiliateStatus, default: VendorAffiliateStatus.invited })
  status!: VendorAffiliateStatus;

  @Column({
    type: "enum",
    enum: AffiliateCommissionType,
    default: AffiliateCommissionType.percentage,
  })
  commission_type!: AffiliateCommissionType;

  // bps when commission_type=percentage (10% => 1000); fils when fixed.
  @Column({ type: "integer" })
  commission_value!: number;

  @Index({ unique: true, where: "deleted_at IS NULL" })
  @Column({ type: "varchar", length: 50, unique: true })
  affiliate_code!: string;

  @Column({ type: "uuid", nullable: true })
  invited_by!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  joined_at!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
