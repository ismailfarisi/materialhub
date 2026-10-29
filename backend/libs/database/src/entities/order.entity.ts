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
import { OrderStatus, PaymentStatus } from "../enums.ts";
import type { OrderItem } from "./order-item.entity.ts";
import type { OrderStatusHistory } from "./order-status-history.entity.ts";
import type { Payment } from "./payment.entity.ts";
import type { Return } from "./return.entity.ts";
import type { Shipment } from "./shipment.entity.ts";
import type { User } from "./user.entity.ts";
import type { VendorOrder } from "./vendor-order.entity.ts";

@Entity("orders")
export class Order {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index({ unique: true, where: "deleted_at IS NULL" })
  @Column({ type: "varchar", length: 30, unique: true })
  order_number!: string;

  @Column({ type: "uuid" })
  user_id!: string;

  @ManyToOne("User", "orders")
  @JoinColumn({ name: "user_id" })
  user!: User;

  @Column({ type: "enum", enum: OrderStatus, default: OrderStatus.pending_payment })
  status!: OrderStatus;

  @Column({ type: "enum", enum: PaymentStatus, default: PaymentStatus.pending })
  payment_status!: PaymentStatus;

  @Column({ type: "integer" })
  subtotal!: number;

  @Column({ type: "integer", default: 0 })
  discount_total!: number;

  @Column({ type: "integer", default: 0 })
  shipping_total!: number;

  @Column({ type: "integer", default: 0 })
  surcharge_total!: number;

  @Column({ type: "integer", default: 0 })
  tax_total!: number;

  @Column({ type: "integer" })
  grand_total!: number;

  @Column({ type: "integer", default: 0 })
  refund_total!: number;

  @Column({ type: "varchar", length: 1024, nullable: true })
  invoice_s3_key!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  invoice_generated_at!: Date | null;

  @Column({ type: "text", nullable: true })
  invoice_last_error!: string | null;

  @Column({ type: "char", length: 3, default: "AED" })
  currency!: string;

  @Column({ type: "numeric", precision: 12, scale: 6, default: 1 })
  exchange_rate!: number;

  @Column({ type: "char", length: 3, default: "AED" })
  base_currency!: string;

  @Column({ type: "uuid", nullable: true })
  coupon_id!: string | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  coupon_code!: string | null;

  @Column({ type: "integer", default: 0 })
  coupon_discount!: number;

  @Column({ type: "jsonb" })
  shipping_address!: Record<string, unknown>;

  @Column({ type: "jsonb", nullable: true })
  billing_address!: Record<string, unknown> | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  shipping_method!: string | null;

  @Column({ type: "date", nullable: true })
  expected_delivery_date!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  delivered_at!: Date | null;

  @Column({ type: "text", nullable: true })
  customer_notes!: string | null;

  @Column({ type: "text", nullable: true })
  admin_notes!: string | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  channel!: string | null;

  @Column({ type: "varchar", length: 45, nullable: true })
  ip_address!: string | null;

  @Column({ type: "varchar", length: 512, nullable: true })
  user_agent!: string | null;

  @Column({ type: "jsonb", nullable: true })
  attribution!: Record<string, unknown> | null;

  @Column({ type: "boolean", default: false })
  is_test_order!: boolean;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;

  @OneToMany("VendorOrder", "order")
  vendorOrders!: VendorOrder[];

  @OneToMany("OrderItem", "order")
  items!: OrderItem[];

  @OneToMany("OrderStatusHistory", "order")
  statusHistory!: OrderStatusHistory[];

  @OneToMany("Payment", "order")
  payments!: Payment[];

  @OneToMany("Shipment", "order")
  shipments!: Shipment[];

  @OneToMany("Return", "order")
  returns!: Return[];
}
