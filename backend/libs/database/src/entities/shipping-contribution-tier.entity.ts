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
import type { Vendor } from "./vendor.entity.ts";

@Entity("shipping_contribution_tiers")
export class ShippingContributionTier {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // NULL = global default band; set = per-vendor override band.
  @Column({ type: "uuid", nullable: true })
  vendor_id!: string | null;

  @ManyToOne("Vendor", { nullable: true })
  @JoinColumn({ name: "vendor_id" })
  vendor!: Vendor | null;

  // Inclusive lower bound of the order-value band, in fils.
  @Column({ type: "integer" })
  min_order_value!: number;

  // What the vendor pays for this band, in fils. The top band is the cap.
  @Column({ type: "integer" })
  vendor_contribution!: number;

  @Column({ type: "char", length: 3, default: "AED" })
  currency!: string;

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
