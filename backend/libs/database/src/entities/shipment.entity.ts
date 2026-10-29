import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { ShipmentStatus } from "../enums.ts";
import type { Order } from "./order.entity.ts";
import type { ShipmentEvent } from "./shipment-event.entity.ts";
import type { ShipmentItem } from "./shipment-item.entity.ts";
import type { VendorOrder } from "./vendor-order.entity.ts";
import type { Vendor } from "./vendor.entity.ts";

@Entity("shipments")
export class Shipment {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  order_id!: string;

  @ManyToOne("Order", "shipments")
  @JoinColumn({ name: "order_id" })
  order!: Order;

  @Column({ type: "uuid" })
  vendor_order_id!: string;

  @ManyToOne("VendorOrder", "shipments")
  @JoinColumn({ name: "vendor_order_id" })
  vendorOrder!: VendorOrder;

  @Column({ type: "uuid" })
  vendor_id!: string;

  @ManyToOne("Vendor")
  @JoinColumn({ name: "vendor_id" })
  vendor!: Vendor;

  @Column({ type: "uuid", nullable: true })
  warehouse_id!: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  tracking_number!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  external_shipment_id!: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  carrier!: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  carrier_service!: string | null;

  @Column({ type: "varchar", length: 1024, nullable: true })
  tracking_url!: string | null;

  @Column({ type: "varchar", length: 1024, nullable: true })
  label_url!: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  pickup_code!: string | null;

  @Column({ type: "enum", enum: ShipmentStatus, default: ShipmentStatus.pending })
  status!: ShipmentStatus;

  @Column({ type: "timestamptz", nullable: true })
  shipped_at!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  estimated_delivery_at!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  delivered_at!: Date | null;

  @Column({ type: "integer", nullable: true })
  weight_grams!: number | null;

  @Column({ type: "integer", nullable: true })
  shipping_cost!: number | null;

  /**
   * What this shipment cost the platform, in fils — the
   * `shipping.base_carrier_cost_fils` reference rate captured at creation, so
   * the figure survives a later rate change.
   *
   * Distinct from `shipping_cost` above (caller-supplied, unused) and from
   * `vendor_orders.carrier_cost` (whatever the carrier adapter reported, which
   * is 0 for PostaPlus). Informational only: it is reported on vendor payouts
   * but never deducted from them.
   */
  @Column({ type: "integer", default: 0 })
  carrier_cost_fils!: number;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;

  @OneToMany("ShipmentItem", "shipment")
  items!: ShipmentItem[];

  @OneToMany("ShipmentEvent", "shipment")
  events!: ShipmentEvent[];
}
