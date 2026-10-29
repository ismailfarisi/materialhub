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
import type { Vendor } from "./vendor.entity.ts";

@Entity("vendor_holidays")
export class VendorHoliday {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "uuid" })
  vendor_id!: string;

  @ManyToOne("Vendor", "holidays", { onDelete: "CASCADE" })
  @JoinColumn({ name: "vendor_id" })
  vendor!: Vendor;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Column({ type: "date" })
  starts_at!: Date;

  @Column({ type: "date" })
  ends_at!: Date;

  @Column({ type: "boolean", default: true })
  auto_extend_sla!: boolean;

  @Column({ type: "boolean", default: true })
  notify_customers!: boolean;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
