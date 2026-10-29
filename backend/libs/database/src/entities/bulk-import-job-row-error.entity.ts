import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { BulkImportJob } from "./bulk-import-job.entity.ts";

@Index(["job_id", "row_number"])
@Entity("bulk_import_job_row_errors")
export class BulkImportJobRowError {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  job_id!: string;

  @ManyToOne("BulkImportJob", "rowErrors", { onDelete: "CASCADE" })
  @JoinColumn({ name: "job_id" })
  job!: BulkImportJob;

  @Column({ type: "int" })
  row_number!: number;

  @Column({ type: "varchar", length: 64, nullable: true })
  sheet_name!: string | null;

  @Column({ type: "varchar", length: 64 })
  error_code!: string;

  @Column({ type: "text" })
  error_message!: string;

  @Column({ type: "varchar", length: 64, nullable: true })
  field!: string | null;

  @Column({ type: "jsonb" })
  row_snapshot!: Record<string, unknown>;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;
}
