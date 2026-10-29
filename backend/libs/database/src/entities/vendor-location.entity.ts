import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("vendor_locations")
export class VendorLocation {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index("idx_vendor_locations_vendor", { where: "deleted_at IS NULL" })
  @Column({ type: "uuid" })
  vendor_id!: string;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Column({ type: "jsonb", nullable: true })
  address!: Record<string, unknown> | null;

  @Column({ type: "numeric", precision: 10, scale: 7, nullable: true })
  lat!: number | null;

  @Column({ type: "numeric", precision: 10, scale: 7, nullable: true })
  lng!: number | null;

  @Column({ type: "uuid", nullable: true })
  area_id!: string | null;

  @Column({ type: "varchar", length: 64, default: "Asia/Dubai" })
  timezone!: string;

  @Column({ type: "boolean", default: true })
  is_active!: boolean;

  // Per-branch overrides: payment defaults, cancellation/reschedule policy,
  // operating-hours defaults. Falls back to the offering/vendor when absent.
  @Column({ type: "jsonb", default: {} })
  settings!: Record<string, unknown>;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
