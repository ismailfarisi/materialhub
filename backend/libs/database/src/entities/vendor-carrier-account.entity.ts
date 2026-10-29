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
import type { ShippingProvider } from "./shipping-provider.entity.ts";
import type { Vendor } from "./vendor.entity.ts";

@Entity("vendor_carrier_accounts")
@Index("vendor_carrier_accounts_vendor_idx", ["vendor_id"], { where: "deleted_at IS NULL" })
@Index("vendor_carrier_accounts_vendor_provider_uq", ["vendor_id", "provider_id"], {
  unique: true,
  where: "deleted_at IS NULL",
})
@Index("vendor_carrier_accounts_platform_provider_uq", ["provider_id"], {
  unique: true,
  where: "vendor_id IS NULL AND deleted_at IS NULL",
})
export class VendorCarrierAccount {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  /** NULL marks a platform-owned account (MaterialHub's own carrier credentials). */
  @Column({ type: "uuid", nullable: true })
  vendor_id!: string | null;

  @ManyToOne("Vendor", { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "vendor_id" })
  vendor!: Vendor | null;

  @Column({ type: "uuid" })
  provider_id!: string;

  @ManyToOne("ShippingProvider", { onDelete: "RESTRICT" })
  @JoinColumn({ name: "provider_id" })
  provider!: ShippingProvider;

  @Column({ type: "varchar", length: 255 })
  display_name!: string;

  @Column({ type: "text" })
  credentials_encrypted!: string;

  @Column({ type: "varchar", length: 8, nullable: true })
  credentials_last4!: string | null;

  @Column({ type: "boolean", default: true })
  is_active!: boolean;

  @Column({ type: "boolean", default: false })
  is_verified!: boolean;

  @Column({ type: "timestamptz", nullable: true })
  verified_at!: Date | null;

  @Column({ type: "text", nullable: true })
  last_verify_error!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
