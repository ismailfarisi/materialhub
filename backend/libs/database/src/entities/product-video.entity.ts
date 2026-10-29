import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import type { Product } from "./product.entity.ts";

export type ProductVideoStatus = "processing" | "ready" | "failed";
export type ProductVideoAssetType = "product" | "layout_background";

@Entity("product_videos")
export class ProductVideo {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid", nullable: true })
  product_id!: string | null;

  @ManyToOne("Product", { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "product_id" })
  product!: Product | null;

  @Column({ type: "varchar", length: 32, default: "product" })
  asset_type!: ProductVideoAssetType;

  @Column({ type: "uuid", nullable: true })
  vendor_id!: string | null;

  @Column({ type: "uuid", nullable: true })
  variant_id!: string | null;

  @Column({ type: "varchar", length: 1024 })
  url!: string;

  @Column({ type: "varchar", length: 1024, nullable: true })
  webm_url!: string | null;

  @Column({ type: "varchar", length: 1024 })
  poster_url!: string;

  @Column({ type: "smallint" })
  duration_seconds!: number;

  @Column({ type: "integer", nullable: true })
  width!: number | null;

  @Column({ type: "integer", nullable: true })
  height!: number | null;

  @Column({ type: "integer", nullable: true })
  file_size!: number | null;

  @Column({ type: "smallint", default: 0 })
  sort_order!: number;

  @Column({ type: "varchar", length: 50, nullable: true })
  mime_type!: string | null;

  @Column({ type: "varchar", length: 16, default: "processing" })
  status!: ProductVideoStatus;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
