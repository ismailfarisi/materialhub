import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import {
  BulkImportMode,
  BulkJobFileFormat,
  BulkJobStatus,
  BulkJobStrictness,
  BulkJobType,
  UserRole,
} from "../enums.ts";
import type { BulkImportJobImageTask } from "./bulk-import-job-image-task.entity.ts";
import type { BulkImportJobRowChange } from "./bulk-import-job-row-change.entity.ts";
import type { BulkImportJobRowError } from "./bulk-import-job-row-error.entity.ts";
import type { User } from "./user.entity.ts";
import type { Vendor } from "./vendor.entity.ts";

@Entity("bulk_import_jobs")
export class BulkImportJob {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "enum", enum: BulkJobType })
  job_type!: BulkJobType;

  @Column({ type: "enum", enum: BulkJobStatus, default: BulkJobStatus.PendingUpload })
  status!: BulkJobStatus;

  @Column({ type: "enum", enum: BulkJobStrictness })
  strictness!: BulkJobStrictness;

  @Column({
    type: "enum",
    enum: BulkImportMode,
    default: BulkImportMode.Upsert,
  })
  import_mode!: BulkImportMode;

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

  @Column({ type: "varchar", length: 512 })
  file_s3_key!: string;

  @Column({ type: "varchar", length: 256 })
  file_name!: string;

  @Column({ type: "int" })
  file_size_bytes!: number;

  @Column({ type: "enum", enum: BulkJobFileFormat })
  file_format!: BulkJobFileFormat;

  @Column({ type: "int", nullable: true })
  total_rows!: number | null;

  @Column({ type: "int", default: 0 })
  processed_rows!: number;

  @Column({ type: "int", default: 0 })
  succeeded_rows!: number;

  @Column({ type: "int", default: 0 })
  skipped_rows!: number;

  @Column({ type: "int", default: 0 })
  images_total!: number;

  @Column({ type: "int", default: 0 })
  images_processed!: number;

  @Column({ type: "int", default: 0 })
  images_failed!: number;

  @Column({ type: "varchar", length: 512, nullable: true })
  error_report_s3_key!: string | null;

  @Column({ type: "jsonb", nullable: true })
  summary!: Record<string, unknown> | null;

  @Column({ type: "timestamptz", nullable: true })
  queued_at!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  started_at!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  completed_at!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  cancel_requested_at!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  reverted_at!: Date | null;

  @Column({ type: "uuid", nullable: true })
  reverted_by_user_id!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;

  @OneToMany("BulkImportJobRowError", "job")
  rowErrors!: BulkImportJobRowError[];

  @OneToMany("BulkImportJobRowChange", "job")
  rowChanges!: BulkImportJobRowChange[];

  @OneToMany("BulkImportJobImageTask", "job")
  imageTasks!: BulkImportJobImageTask[];
}
