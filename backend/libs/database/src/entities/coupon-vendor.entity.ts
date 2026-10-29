import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import type { Coupon } from "./coupon.entity.ts";
import type { Vendor } from "./vendor.entity.ts";

@Entity("coupon_vendors")
@Unique(["coupon_id", "vendor_id"])
export class CouponVendor {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  coupon_id!: string;

  @ManyToOne("Coupon", "couponVendors")
  @JoinColumn({ name: "coupon_id" })
  coupon!: Coupon;

  @Column({ type: "uuid" })
  vendor_id!: string;

  @ManyToOne("Vendor")
  @JoinColumn({ name: "vendor_id" })
  vendor!: Vendor;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
