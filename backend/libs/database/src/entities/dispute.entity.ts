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
import { DisputeStatus } from "../enums.ts";
import type { Order } from "./order.entity.ts";
import type { User } from "./user.entity.ts";
import type { VendorOrder } from "./vendor-order.entity.ts";
import type { Vendor } from "./vendor.entity.ts";

@Entity("disputes")
export class Dispute {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index({ unique: true, where: "deleted_at IS NULL" })
  @Column({ type: "varchar", length: 30, unique: true })
  dispute_number!: string;

  @Column({ type: "uuid" })
  order_id!: string;

  @ManyToOne("Order")
  @JoinColumn({ name: "order_id" })
  order!: Order;

  @Column({ type: "uuid", nullable: true })
  vendor_order_id!: string | null;

  @ManyToOne("VendorOrder", { nullable: true })
  @JoinColumn({ name: "vendor_order_id" })
  vendorOrder!: VendorOrder | null;

  @Column({ type: "uuid" })
  opened_by!: string;

  @ManyToOne("User")
  @JoinColumn({ name: "opened_by" })
  openedByUser!: User;

  @Column({ type: "uuid" })
  vendor_id!: string;

  @ManyToOne("Vendor")
  @JoinColumn({ name: "vendor_id" })
  vendor!: Vendor;

  @Column({ type: "uuid", nullable: true })
  assigned_to!: string | null;

  @ManyToOne("User", { nullable: true })
  @JoinColumn({ name: "assigned_to" })
  assignedToUser!: User | null;

  @Column({ type: "enum", enum: DisputeStatus, default: DisputeStatus.opened })
  status!: DisputeStatus;

  @Column({ type: "varchar", length: 100 })
  category!: string;

  @Column({ type: "text" })
  description!: string;

  @Column({ type: "jsonb", default: [] })
  evidence_urls!: string[];

  @Column({ type: "text", nullable: true })
  resolution!: string | null;

  @Column({ type: "integer", nullable: true })
  resolution_amount!: number | null;

  @Column({ type: "timestamptz", nullable: true })
  resolved_at!: Date | null;

  @Column({ type: "uuid", nullable: true })
  resolved_by!: string | null;

  @ManyToOne("User", { nullable: true })
  @JoinColumn({ name: "resolved_by" })
  resolvedByUser!: User | null;

  @Column({ type: "timestamptz", nullable: true })
  escalated_at!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  deadline_at!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
