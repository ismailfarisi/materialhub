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
import {
  BulkExportFileFormat,
  BulkExportJobStatus,
  BulkExportJobType,
  ProductExportPreset,
  UserRole,
} from "../enums.ts";
import type { User } from "./user.entity.ts";
import type { Vendor } from "./vendor.entity.ts";

@Entity("bulk_export_jobs")
@Index("idx_bulk_export_jobs_vendor_created", ["vendor_id", "created_at"], {
  where: "deleted_at IS NULL",
})
@Index("idx_bulk_export_jobs_user_created", ["initiated_by_user_id", "created_at"], {
  where: "deleted_at IS NULL",
})
@Index("idx_bulk_export_jobs_status", ["status", "created_at"], {
  where: "deleted_at IS NULL AND status IN ('queued', 'running')",
})
export class BulkExportJob {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "enum", enum: BulkExportJobType, enumName: "bulk_export_job_type_enum" })
  job_type!: BulkExportJobType;

  @Column({
    type: "enum",
    enum: BulkExportJobStatus,
    enumName: "bulk_export_job_status_enum",
    default: BulkExportJobStatus.Queued,
  })
  status!: BulkExportJobStatus;

  @Column({ type: "uuid", nullable: true })
  vendor_id!: string | null;

  @ManyToOne("Vendor", { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "vendor_id" })
  vendor!: Vendor | null;

  @Column({ type: "uuid" })
  initiated_by_user_id!: string;

  @ManyToOne("User", { onDelete: "RESTRICT" })
  @JoinColumn({ name: "initiated_by_user_id" })
  initiatedBy!: User;

  @Column({ type: "enum", enum: UserRole, enumName: "user_role" })
  initiated_by_role!: UserRole;

  @Column({ type: "enum", enum: BulkExportFileFormat, enumName: "bulk_export_file_format_enum" })
  format!: BulkExportFileFormat;

  @Column({ type: "enum", enum: ProductExportPreset, enumName: "product_export_preset_enum" })
  preset!: ProductExportPreset;

  @Column({ type: "jsonb" })
  field_groups!: string[];

  @Column({ type: "jsonb" })
  fields!: string[];

  @Column({ type: "jsonb" })
  filters!: Record<string, unknown>;

  @Column({ type: "varchar", length: 512, nullable: true })
  file_s3_key!: string | null;

  @Column({ type: "varchar", length: 256 })
  file_name!: string;

  @Column({ type: "int", nullable: true })
  file_size_bytes!: number | null;

  @Column({ type: "jsonb", nullable: true })
  row_counts!: Record<string, number> | null;

  @Column({ type: "text", nullable: true })
  error_message!: string | null;

  @Column({ type: "timestamptz" })
  expires_at!: Date;

  @Column({ type: "timestamptz", nullable: true })
  queued_at!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  started_at!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  completed_at!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
