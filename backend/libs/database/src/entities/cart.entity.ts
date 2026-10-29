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
import type { Coupon } from "./coupon.entity.ts";
import type { GuestSession } from "./guest-session.entity.ts";
import type { User } from "./user.entity.ts";

@Entity("carts")
export class Cart {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid", nullable: true })
  user_id!: string | null;

  @ManyToOne("User", { nullable: true })
  @JoinColumn({ name: "user_id" })
  user!: User | null;

  @Column({ type: "uuid", nullable: true })
  guest_session_id!: string | null;

  @ManyToOne("GuestSession", { nullable: true })
  @JoinColumn({ name: "guest_session_id" })
  guest_session!: GuestSession | null;

  @Column({ type: "uuid", nullable: true })
  coupon_id!: string | null;

  @ManyToOne("Coupon", { nullable: true })
  @JoinColumn({ name: "coupon_id" })
  coupon!: Coupon | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  coupon_code!: string | null;

  @Column({ type: "integer", default: 0 })
  coupon_discount!: number;

  @Column({ type: "integer", default: 0 })
  subtotal!: number;

  @Column({ type: "char", length: 3, default: "AED" })
  currency!: string;

  @Column({ type: "integer", default: 0 })
  item_count!: number;

  @Column({ type: "timestamptz", default: () => "NOW()" })
  last_activity_at!: Date;

  @Column({ type: "timestamptz" })
  expires_at!: Date;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
