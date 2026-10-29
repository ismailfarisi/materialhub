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
import type { Coupon } from "./coupon.entity.ts";
import type { Order } from "./order.entity.ts";
import type { User } from "./user.entity.ts";

@Entity("coupon_usages")
export class CouponUsage {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  coupon_id!: string;

  @ManyToOne("Coupon", "usages")
  @JoinColumn({ name: "coupon_id" })
  coupon!: Coupon;

  @Column({ type: "uuid" })
  user_id!: string;

  @ManyToOne("User")
  @JoinColumn({ name: "user_id" })
  user!: User;

  @Index({ unique: true, where: "deleted_at IS NULL" })
  @Column({ type: "uuid", unique: true })
  order_id!: string;

  @ManyToOne("Order")
  @JoinColumn({ name: "order_id" })
  order!: Order;

  @Column({ type: "integer" })
  discount_applied!: number;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
