import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { OrderItem } from "./order-item.entity.ts";
import type { Order } from "./order.entity.ts";
import type { User } from "./user.entity.ts";
import type { VendorOrder } from "./vendor-order.entity.ts";

@Entity("order_status_history")
export class OrderStatusHistory {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  order_id!: string;

  @ManyToOne("Order", "statusHistory")
  @JoinColumn({ name: "order_id" })
  order!: Order;

  @Column({ type: "uuid", nullable: true })
  vendor_order_id!: string | null;

  @ManyToOne("VendorOrder", { nullable: true })
  @JoinColumn({ name: "vendor_order_id" })
  vendorOrder!: VendorOrder | null;

  @Column({ type: "uuid", nullable: true })
  order_item_id!: string | null;

  @ManyToOne("OrderItem", { nullable: true })
  @JoinColumn({ name: "order_item_id" })
  orderItem!: OrderItem | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  from_status!: string | null;

  @Column({ type: "varchar", length: 50 })
  to_status!: string;

  @Column({ type: "text", nullable: true })
  comment!: string | null;

  @Column({ type: "boolean", default: true })
  is_customer_visible!: boolean;

  @Column({ type: "uuid", nullable: true })
  changed_by!: string | null;

  @ManyToOne("User", { nullable: true })
  @JoinColumn({ name: "changed_by" })
  changedByUser!: User | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  changed_by_role!: string | null;

  @Column({ type: "jsonb", nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;
}
