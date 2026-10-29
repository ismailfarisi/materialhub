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
import type { Category } from "./category.entity.ts";
import type { Coupon } from "./coupon.entity.ts";

@Entity("coupon_categories")
@Unique(["coupon_id", "category_id"])
export class CouponCategory {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  coupon_id!: string;

  @ManyToOne("Coupon", "couponCategories")
  @JoinColumn({ name: "coupon_id" })
  coupon!: Coupon;

  @Column({ type: "uuid" })
  category_id!: string;

  @ManyToOne("Category")
  @JoinColumn({ name: "category_id" })
  category!: Category;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
