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
import { IntegrationAuthority } from "../enums/integration.enums.ts";
import type { Vendor } from "./vendor.entity.ts";

@Entity("vendor_integrations")
@Index("vendor_integrations_active_uq", ["vendor_id"], {
  unique: true,
  where: "is_active = true AND deleted_at IS NULL",
})
export class VendorIntegration {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  vendor_id!: string;

  @ManyToOne("Vendor", { onDelete: "CASCADE" })
  @JoinColumn({ name: "vendor_id" })
  vendor!: Vendor;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Column({ type: "text", nullable: true })
  outbound_url!: string | null;

  @Column({ type: "text", nullable: true })
  outbound_secret_encrypted!: string | null;

  @Column({ type: "text", nullable: true })
  outbound_previous_secret_encrypted!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  outbound_secret_rotated_at!: Date | null;

  @Column({ type: "text", nullable: true })
  inbound_secret_encrypted!: string | null;

  @Column({ type: "varchar", length: 8, nullable: true })
  inbound_secret_last4!: string | null;

  @Column({ type: "text", array: true, default: "{}" })
  inbound_ip_allowlist!: string[];

  @Column({
    type: "enum",
    enum: IntegrationAuthority,
    default: IntegrationAuthority.advisory,
  })
  inventory_authority!: IntegrationAuthority;

  @Column({
    type: "enum",
    enum: IntegrationAuthority,
    default: IntegrationAuthority.advisory,
  })
  pricing_authority!: IntegrationAuthority;

  @Column({ type: "boolean", default: true })
  is_active!: boolean;

  @Column({ type: "timestamptz", nullable: true })
  degraded_until!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  last_outbound_success_at!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  last_inbound_success_at!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
