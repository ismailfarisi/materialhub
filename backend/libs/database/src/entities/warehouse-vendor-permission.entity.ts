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
import type { Warehouse } from "./warehouse.entity.ts";

@Entity("warehouse_vendor_permissions")
@Index("uq_warehouse_vendor_permissions_active", ["warehouse_id", "vendor_id", "permission"], {
  unique: true,
  where: "deleted_at IS NULL",
})
export class WarehouseVendorPermission {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  warehouse_id!: string;

  @ManyToOne("Warehouse")
  @JoinColumn({ name: "warehouse_id" })
  warehouse!: Warehouse;

  @Column({ type: "uuid" })
  vendor_id!: string;

  @ManyToOne("Vendor")
  @JoinColumn({ name: "vendor_id" })
  vendor!: Vendor;

  @Column({ type: "varchar", length: 64 })
  permission!: string;

  @Column({ type: "boolean", default: true })
  is_active!: boolean;

  @Column({ type: "uuid", nullable: true })
  granted_by_user_id!: string | null;

  @Column({ type: "text", nullable: true })
  reason!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
