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
import { VendorDocumentType } from "../enums.ts";
import type { User } from "./user.entity.ts";
import type { Vendor } from "./vendor.entity.ts";

@Entity("vendor_documents")
export class VendorDocument {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "uuid" })
  vendor_id!: string;

  @ManyToOne("Vendor", "documents", { onDelete: "CASCADE" })
  @JoinColumn({ name: "vendor_id" })
  vendor!: Vendor;

  @Column({ type: "enum", enum: VendorDocumentType })
  type!: VendorDocumentType;

  @Column({ type: "varchar", length: 1024 })
  file_url!: string;

  @Column({ type: "varchar", length: 255 })
  file_name!: string;

  @Column({ type: "integer", nullable: true })
  file_size!: number | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  mime_type!: string | null;

  @Column({ type: "date", nullable: true })
  expiry_date!: Date | null;

  @Column({ type: "boolean", default: false })
  is_verified!: boolean;

  @Column({ type: "timestamptz", nullable: true })
  verified_at!: Date | null;

  @Column({ type: "uuid", nullable: true })
  verified_by!: string | null;

  @ManyToOne("User", { nullable: true })
  @JoinColumn({ name: "verified_by" })
  verifiedByUser!: User | null;

  @Column({ type: "text", nullable: true })
  rejection_reason!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
