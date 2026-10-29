import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import type { Vendor } from "./vendor.entity.ts";

@Entity("vendor_translations")
@Unique(["vendor_id", "locale"])
export class VendorTranslation {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "uuid" })
  vendor_id!: string;

  @ManyToOne("Vendor", "translations", { onDelete: "CASCADE" })
  @JoinColumn({ name: "vendor_id" })
  vendor!: Vendor;

  @Column({ type: "varchar", length: 10 })
  locale!: string;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "text", nullable: true })
  return_policy!: string | null;

  @Column({ type: "text", nullable: true })
  shipping_policy!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  meta_title!: string | null;

  @Column({ type: "varchar", length: 500, nullable: true })
  meta_description!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
