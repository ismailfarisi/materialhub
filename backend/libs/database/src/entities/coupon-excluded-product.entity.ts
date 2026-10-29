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
import type { Product } from "./product.entity.ts";

@Entity("coupon_excluded_products")
@Unique(["coupon_id", "product_id"])
export class CouponExcludedProduct {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  coupon_id!: string;

  @ManyToOne("Coupon", "couponExcludedProducts")
  @JoinColumn({ name: "coupon_id" })
  coupon!: Coupon;

  @Column({ type: "uuid" })
  product_id!: string;

  @ManyToOne("Product")
  @JoinColumn({ name: "product_id" })
  product!: Product;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
