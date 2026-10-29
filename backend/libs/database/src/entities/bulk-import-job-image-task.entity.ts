import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { BulkImageTaskStatus } from "../enums.ts";
import type { BulkImportJob } from "./bulk-import-job.entity.ts";
import type { ProductImage } from "./product-image.entity.ts";
import type { ProductVariant } from "./product-variant.entity.ts";
import type { Product } from "./product.entity.ts";

@Index(["job_id", "status"])
@Entity("bulk_import_job_image_tasks")
export class BulkImportJobImageTask {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  job_id!: string;

  @ManyToOne("BulkImportJob", "imageTasks", { onDelete: "CASCADE" })
  @JoinColumn({ name: "job_id" })
  job!: BulkImportJob;

  @Column({ type: "int" })
  row_number!: number;

  @Column({ type: "uuid" })
  product_id!: string;

  @ManyToOne("Product", { onDelete: "CASCADE" })
  @JoinColumn({ name: "product_id" })
  product!: Product;

  @Column({ type: "uuid", nullable: true })
  variant_id!: string | null;

  @ManyToOne("ProductVariant", { nullable: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "variant_id" })
  variant!: ProductVariant | null;

  @Column({ type: "text" })
  source_url!: string;

  @Column({ type: "smallint", default: 0 })
  sort_order!: number;

  @Column({ type: "enum", enum: BulkImageTaskStatus, default: BulkImageTaskStatus.Queued })
  status!: BulkImageTaskStatus;

  @Column({ type: "smallint", default: 0 })
  attempt_count!: number;

  @Column({ type: "text", nullable: true })
  last_error!: string | null;

  @Column({ type: "uuid", nullable: true })
  product_image_id!: string | null;

  @ManyToOne("ProductImage", { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "product_image_id" })
  productImage!: ProductImage | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;
}
