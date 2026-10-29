import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { CouponApplicableTo, CouponType } from "../enums.ts";
import type { CouponCategory } from "./coupon-category.entity.ts";
import type { CouponExcludedProduct } from "./coupon-excluded-product.entity.ts";
import type { CouponProduct } from "./coupon-product.entity.ts";
import type { CouponUsage } from "./coupon-usage.entity.ts";
import type { CouponUserRestriction } from "./coupon-user-restriction.entity.ts";
import type { CouponVendor } from "./coupon-vendor.entity.ts";
import type { Vendor } from "./vendor.entity.ts";

@Entity("coupons")
export class Coupon {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index({ unique: true, where: "deleted_at IS NULL" })
  @Column({ type: "varchar", length: 50, unique: true })
  code!: string;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "enum", enum: CouponType })
  type!: CouponType;

  @Column({ type: "enum", enum: CouponApplicableTo, default: CouponApplicableTo.all })
  applicable_to!: CouponApplicableTo;

  @Column({ type: "uuid", nullable: true })
  collection_id!: string | null;

  @Column({ type: "uuid", nullable: true })
  vendor_id!: string | null;

  @ManyToOne("Vendor", { nullable: true })
  @JoinColumn({ name: "vendor_id" })
  vendor!: Vendor | null;

  @Column({ type: "integer" })
  discount_value!: number;

  @Column({ type: "integer", nullable: true })
  max_discount_amount!: number | null;

  @Column({ type: "char", length: 3, default: "AED" })
  currency!: string;

  @Column({ type: "integer", nullable: true })
  minimum_order_amount!: number | null;

  @Column({ type: "integer", nullable: true })
  minimum_quantity!: number | null;

  @Column({ type: "integer", nullable: true })
  usage_limit!: number | null;

  @Column({ type: "integer", nullable: true })
  usage_limit_per_user!: number | null;

  @Column({ type: "integer", default: 0 })
  usage_count!: number;

  @Column({ type: "timestamptz", nullable: true })
  starts_at!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  expires_at!: Date | null;

  @Column({ type: "boolean", default: true })
  is_active!: boolean;

  @Column({ type: "boolean", default: false })
  is_single_use!: boolean;

  @Column({ type: "boolean", default: true })
  is_public!: boolean;

  @Column({ type: "integer", nullable: true })
  buy_quantity!: number | null;

  @Column({ type: "integer", nullable: true })
  get_quantity!: number | null;

  @Column({ type: "numeric", precision: 5, scale: 2, nullable: true })
  get_discount_percentage!: number | null;

  @Column({ type: "boolean", default: false })
  first_order_only!: boolean;

  @Column({ type: "boolean", default: false })
  new_users_only!: boolean;

  @Column({ type: "uuid", nullable: true })
  created_by!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;

  @OneToMany("CouponProduct", "coupon")
  couponProducts!: CouponProduct[];

  @OneToMany("CouponCategory", "coupon")
  couponCategories!: CouponCategory[];

  @OneToMany("CouponUsage", "coupon")
  usages!: CouponUsage[];

  @OneToMany("CouponVendor", "coupon")
  couponVendors!: CouponVendor[];

  @OneToMany("CouponExcludedProduct", "coupon")
  couponExcludedProducts!: CouponExcludedProduct[];

  @OneToMany("CouponUserRestriction", "coupon")
  couponUserRestrictions!: CouponUserRestriction[];
}
