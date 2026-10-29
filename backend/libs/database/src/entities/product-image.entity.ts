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

@Entity("product_images")
export class ProductImage {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  product_id!: string;

  @ManyToOne("Product", { onDelete: "CASCADE" })
  @JoinColumn({ name: "product_id" })
  product!: Product;

  @Column({ type: "uuid", nullable: true })
  variant_id!: string | null;

  @Column({ type: "varchar", length: 1024 })
  url!: string;

  @Column({ type: "varchar", length: 1024, nullable: true })
  thumbnail_url!: string | null;

  @Column({ type: "varchar", length: 1024, nullable: true })
  card_url!: string | null;

  @Column({ type: "numeric", precision: 4, scale: 3, nullable: true })
  focal_x!: string | null;

  @Column({ type: "numeric", precision: 4, scale: 3, nullable: true })
  focal_y!: string | null;

  @Column({ type: "uuid", nullable: true })
  ai_source_image_id!: string | null;

  @Column({ type: "varchar", length: 1024, nullable: true })
  medium_url!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  alt_text!: string | null;

  @Column({ type: "boolean", default: false })
  is_primary!: boolean;

  @Column({ type: "smallint", default: 0 })
  sort_order!: number;

  @Column({ type: "integer", nullable: true })
  width!: number | null;

  @Column({ type: "integer", nullable: true })
  height!: number | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  mime_type!: string | null;

  @Column({ type: "integer", nullable: true })
  file_size!: number | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
