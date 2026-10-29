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
import { OrderStatus } from "../enums.ts";
import type { OrderItem } from "./order-item.entity.ts";
import type { Order } from "./order.entity.ts";
import type { Shipment } from "./shipment.entity.ts";
import type { Vendor } from "./vendor.entity.ts";

@Entity("vendor_orders")
export class VendorOrder {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  order_id!: string;

  @ManyToOne("Order", "vendorOrders")
  @JoinColumn({ name: "order_id" })
  order!: Order;

  @Column({ type: "uuid" })
  vendor_id!: string;

  @ManyToOne("Vendor")
  @JoinColumn({ name: "vendor_id" })
  vendor!: Vendor;

  @Index({ unique: true, where: "deleted_at IS NULL" })
  @Column({ type: "varchar", length: 30, unique: true })
  vendor_order_number!: string;

  @Column({ type: "enum", enum: OrderStatus, default: OrderStatus.confirmed })
  status!: OrderStatus;

  /** First transition into `delivered`. Starts the settlement window clock. */
  @Column({ type: "timestamptz", nullable: true })
  delivered_at!: Date | null;

  @Column({ type: "integer" })
  subtotal!: number;

  @Column({ type: "integer", default: 0 })
  shipping_cost!: number;

  @Column({ type: "integer", default: 0 })
  carrier_cost!: number;

  // What the vendor is charged for shipping this sub-order, snapshotted at
  // order-creation time from the contribution tiers. Drives the payout
  // deduction (carrier_cost is retained for platform reporting only).
  @Column({ type: "integer", default: 0 })
  shipping_contribution!: number;

  @Column({ type: "integer", default: 0 })
  tax_total!: number;

  @Column({ type: "integer" })
  vendor_total!: number;

  @Column({ type: "char", length: 3, default: "AED" })
  currency!: string;

  @Column({ type: "numeric", precision: 12, scale: 6, default: 1 })
  exchange_rate!: number;

  @Column({ type: "uuid", nullable: true })
  warehouse_id!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  processing_deadline!: Date | null;

  @Column({ type: "text", nullable: true })
  vendor_notes!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  accepted_at!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  rejected_at!: Date | null;

  @Column({ type: "text", nullable: true })
  rejection_reason!: string | null;

  // Final carrier-booking failure reason from the auto-shipment worker;
  // cleared on successful booking or manual retry.
  @Column({ type: "text", nullable: true })
  booking_error!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  received_at_hub_at!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;

  @OneToMany("OrderItem", "vendorOrder")
  items!: OrderItem[];

  @OneToMany("Shipment", "vendorOrder")
  shipments!: Shipment[];
}
