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
import type { DeliveryZone } from "./delivery-zone.entity.ts";
import type { Vendor } from "./vendor.entity.ts";

@Entity("shipping_rates")
export class ShippingRate {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid", nullable: true })
  vendor_id!: string | null;

  @ManyToOne("Vendor", { nullable: true })
  @JoinColumn({ name: "vendor_id" })
  vendor!: Vendor | null;

  @Column({ type: "uuid", nullable: true })
  zone_id!: string | null;

  @ManyToOne("DeliveryZone", { nullable: true })
  @JoinColumn({ name: "zone_id" })
  zone!: DeliveryZone | null;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Column({ type: "varchar", length: 100 })
  method!: string;

  @Column({ type: "integer", nullable: true })
  min_weight_grams!: number | null;

  @Column({ type: "integer", nullable: true })
  max_weight_grams!: number | null;

  @Column({ type: "integer", nullable: true })
  min_order_amount!: number | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  carrier!: string | null;

  @Column({ type: "integer" })
  base_cost!: number;

  @Column({ type: "integer", nullable: true })
  carrier_cost!: number | null;

  @Column({ type: "integer", default: 0 })
  per_kg_cost!: number;

  @Column({ type: "integer", nullable: true })
  free_above!: number | null;

  @Column({ type: "char", length: 3, default: "AED" })
  currency!: string;

  @Column({ type: "smallint", nullable: true })
  estimated_days_min!: number | null;

  @Column({ type: "smallint", nullable: true })
  estimated_days_max!: number | null;

  @Column({ type: "boolean", default: true })
  is_active!: boolean;

  @Column({ type: "integer", default: 0 })
  sort_order!: number;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
