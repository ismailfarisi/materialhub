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

@Entity("vendor_bank_accounts")
export class VendorBankAccount {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "uuid" })
  vendor_id!: string;

  @ManyToOne("Vendor", "bankAccounts", { onDelete: "CASCADE" })
  @JoinColumn({ name: "vendor_id" })
  vendor!: Vendor;

  @Column({ type: "varchar", length: 255 })
  account_holder_name!: string;

  @Column({ type: "varchar", length: 255 })
  bank_name!: string;

  @Column({ type: "varchar", length: 512 })
  account_number_encrypted!: string;

  @Column({ type: "varchar", length: 512, nullable: true })
  iban_encrypted!: string | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  swift_code!: string | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  routing_number!: string | null;

  @Column({ type: "char", length: 3, default: "AED" })
  currency!: string;

  @Column({ type: "boolean", default: false })
  is_primary!: boolean;

  @Column({ type: "boolean", default: false })
  is_verified!: boolean;

  @Column({ type: "timestamptz", nullable: true })
  verified_at!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
