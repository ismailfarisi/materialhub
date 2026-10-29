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
import type { Cart } from "./cart.entity.ts";
import type { GuestSession } from "./guest-session.entity.ts";
import type { Order } from "./order.entity.ts";
import type { User } from "./user.entity.ts";

@Entity("cart_abandoned")
export class CartAbandoned {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  cart_id!: string;

  @ManyToOne("Cart")
  @JoinColumn({ name: "cart_id" })
  cart!: Cart;

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

  @Column({ type: "varchar", length: 255, nullable: true })
  email!: string | null;

  @Column({ type: "jsonb" })
  cart_snapshot!: Record<string, unknown>;

  @Column({ type: "integer" })
  cart_total!: number;

  @Column({ type: "char", length: 3, default: "AED" })
  currency!: string;

  @Column({ type: "integer", default: 0 })
  item_count!: number;

  @Column({ type: "smallint", default: 0 })
  reminder_sent_count!: number;

  @Column({ type: "timestamptz", nullable: true })
  last_reminder_at!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  recovered_at!: Date | null;

  @Column({ type: "uuid", nullable: true })
  recovered_order_id!: string | null;

  @ManyToOne("Order", { nullable: true })
  @JoinColumn({ name: "recovered_order_id" })
  recovered_order!: Order | null;

  @Column({ type: "timestamptz", default: () => "now()" })
  abandoned_at!: Date;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
