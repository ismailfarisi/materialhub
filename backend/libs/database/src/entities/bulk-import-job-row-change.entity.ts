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

@Entity("bulk_import_job_row_changes")
export class BulkImportJobRowChange {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  @Index()
  job_id!: string;

  @ManyToOne("BulkImportJob", "rowChanges", { onDelete: "CASCADE" })
  @JoinColumn({ name: "job_id" })
  job!: BulkImportJob;

  @Column({ type: "int" })
  row_number!: number;

  @Column({ type: "varchar", length: 32 })
  entity_type!: "product" | "product_variant" | "inventory";

  @Column({ type: "uuid" })
  entity_id!: string;

  @Column({ type: "varchar", length: 64 })
  field!: string;

  @Column({ type: "jsonb", nullable: true })
  old_value!: unknown;

  @Column({ type: "jsonb", nullable: true })
  new_value!: unknown;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;
}
