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
import type { User } from "./user.entity.ts";

@Entity("coupon_user_restrictions")
@Unique(["coupon_id", "user_id"])
export class CouponUserRestriction {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  coupon_id!: string;

  @ManyToOne("Coupon", "couponUserRestrictions")
  @JoinColumn({ name: "coupon_id" })
  coupon!: Coupon;

  @Column({ type: "uuid" })
  user_id!: string;

  @ManyToOne("User")
  @JoinColumn({ name: "user_id" })
  user!: User;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
