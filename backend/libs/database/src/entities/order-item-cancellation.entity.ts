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
import type { Order } from "./order.entity.ts";
import type { User } from "./user.entity.ts";

export interface CancelledItemSnapshot {
  order_item_id: string;
  vendor_order_id: string;
  quantity: number;
  refund_amount: number;
}

@Entity("order_item_cancellations")
export class OrderItemCancellation {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  order_id!: string;

  @ManyToOne("Order")
  @JoinColumn({ name: "order_id" })
  order!: Order;

  @Column({ type: "uuid" })
  admin_id!: string;

  @ManyToOne("User")
  @JoinColumn({ name: "admin_id" })
  admin!: User;

  @Column({ type: "text" })
  reason!: string;

  @Column({ type: "integer" })
  refund_amount!: number;

  @Column({ type: "char", length: 3, default: "AED" })
  currency!: string;

  @Column({ type: "varchar", length: 30 })
  refund_method!: string; // "stripe" | "cod_uncollected"

  @Column({ type: "varchar", length: 255, nullable: true })
  gateway_refund_id!: string | null;

  @Column({ type: "varchar", length: 20, default: "completed" })
  status!: string; // "pending" | "completed" | "failed"

  @Column({ type: "jsonb" })
  items!: CancelledItemSnapshot[];

  @Index()
  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
