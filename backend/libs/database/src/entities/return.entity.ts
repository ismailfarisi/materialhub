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
import { ReturnReason, ReturnStatus } from "../enums.ts";
import type { Order } from "./order.entity.ts";
import type { ReturnItem } from "./return-item.entity.ts";
import type { User } from "./user.entity.ts";
import type { VendorOrder } from "./vendor-order.entity.ts";
import type { Vendor } from "./vendor.entity.ts";

@Entity("returns")
export class Return {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index({ unique: true, where: "deleted_at IS NULL" })
  @Column({ type: "varchar", length: 30, unique: true })
  return_number!: string;

  @Column({ type: "uuid" })
  order_id!: string;

  @ManyToOne("Order", "returns")
  @JoinColumn({ name: "order_id" })
  order!: Order;

  @Column({ type: "uuid" })
  vendor_order_id!: string;

  @ManyToOne("VendorOrder")
  @JoinColumn({ name: "vendor_order_id" })
  vendorOrder!: VendorOrder;

  @Column({ type: "uuid" })
  user_id!: string;

  @ManyToOne("User")
  @JoinColumn({ name: "user_id" })
  user!: User;

  @Column({ type: "uuid" })
  vendor_id!: string;

  @ManyToOne("Vendor")
  @JoinColumn({ name: "vendor_id" })
  vendor!: Vendor;

  @Column({ type: "enum", enum: ReturnStatus, default: ReturnStatus.requested })
  status!: ReturnStatus;

  @Column({ type: "enum", enum: ReturnReason })
  reason!: ReturnReason;

  @Column({ type: "text", nullable: true })
  reason_details!: string | null;

  @Column({ type: "jsonb", default: [] })
  media_urls!: string[];

  @Column({ type: "varchar", length: 100, nullable: true })
  return_shipping_carrier!: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  return_tracking_number!: string | null;

  @Column({ type: "integer", nullable: true })
  return_shipping_cost!: number | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  return_shipping_paid_by!: string | null;

  @Column({ type: "integer", nullable: true })
  refund_amount!: number | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  refund_method!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  refunded_at!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  approved_at!: Date | null;

  @Column({ type: "uuid", nullable: true })
  approved_by!: string | null;

  @ManyToOne("User", { nullable: true })
  @JoinColumn({ name: "approved_by" })
  approvedByUser!: User | null;

  @Column({ type: "timestamptz", nullable: true })
  rejected_at!: Date | null;

  @Column({ type: "text", nullable: true })
  rejection_reason!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  received_at!: Date | null;

  @Column({ type: "boolean", default: false })
  restocked!: boolean;

  @Column({ type: "text", nullable: true })
  admin_notes!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;

  @OneToMany("ReturnItem", "return_")
  returnItems!: ReturnItem[];
}
