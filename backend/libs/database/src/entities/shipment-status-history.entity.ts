import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { ShipmentStatus } from "../enums.ts";
import type { Shipment } from "./shipment.entity.ts";
import type { VendorOrder } from "./vendor-order.entity.ts";

@Entity("shipment_status_history")
export class ShipmentStatusHistory {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  shipment_id!: string;

  @ManyToOne("Shipment")
  @JoinColumn({ name: "shipment_id" })
  shipment!: Shipment;

  @Column({ type: "uuid" })
  vendor_order_id!: string;

  @ManyToOne("VendorOrder")
  @JoinColumn({ name: "vendor_order_id" })
  vendorOrder!: VendorOrder;

  @Column({ type: "enum", enum: ShipmentStatus })
  from_status!: ShipmentStatus;

  @Column({ type: "enum", enum: ShipmentStatus })
  to_status!: ShipmentStatus;

  @Column({ type: "uuid", nullable: true })
  changed_by!: string | null;

  @Column({ type: "varchar", length: 50 })
  changed_by_role!: string;

  @Column({ type: "boolean", default: false })
  is_customer_visible!: boolean;

  @Column({ type: "text", nullable: true })
  reason!: string | null;

  @Column({ type: "jsonb", nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;
}
