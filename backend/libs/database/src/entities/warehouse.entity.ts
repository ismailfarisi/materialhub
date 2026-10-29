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
import type { DeliveryZone } from "./delivery-zone.entity.ts";
import type { Vendor } from "./vendor.entity.ts";

@Entity("warehouses")
export class Warehouse {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid", nullable: true })
  vendor_id!: string | null;

  @ManyToOne("Vendor", { nullable: true })
  @JoinColumn({ name: "vendor_id" })
  vendor!: Vendor | null;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Index({ unique: true, where: "deleted_at IS NULL" })
  @Column({ type: "varchar", length: 50 })
  code!: string;

  @Column({ type: "varchar", length: 255 })
  address_line_1!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  address_line_2!: string | null;

  @Column({ type: "varchar", length: 100 })
  city!: string;

  @Column({ type: "varchar", length: 50 })
  emirate!: string;

  @Column({ type: "char", length: 2, default: "AE" })
  country_code!: string;

  @Column({ type: "numeric", precision: 10, scale: 7, nullable: true })
  latitude!: number | null;

  @Column({ type: "numeric", precision: 10, scale: 7, nullable: true })
  longitude!: number | null;

  @Column({ type: "uuid", nullable: true })
  zone_id!: string | null;

  @ManyToOne("DeliveryZone", { nullable: true })
  @JoinColumn({ name: "zone_id" })
  zone!: DeliveryZone | null;

  @Column({ type: "boolean", default: true })
  is_active!: boolean;

  @Column({ type: "boolean", default: false })
  is_default!: boolean;

  @Column({ type: "jsonb", nullable: true })
  operating_hours!: Record<string, unknown> | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  contact_phone!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  contact_email!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
