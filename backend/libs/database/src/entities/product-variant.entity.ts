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

@Entity("product_variants")
export class ProductVariant {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  product_id!: string;

  @ManyToOne("Product", { onDelete: "CASCADE" })
  @JoinColumn({ name: "product_id" })
  product!: Product;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  sku!: string | null;

  @Column({ type: "varchar", length: 128, nullable: true })
  external_id!: string | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  barcode!: string | null;

  @Column({ type: "jsonb" })
  option_values!: Record<string, unknown>;

  @Column({ type: "integer" })
  price!: number;

  @Column({ type: "integer", nullable: true })
  compare_at_price!: number | null;

  @Column({ type: "integer", nullable: true })
  cost_price!: number | null;

  @Column({ type: "jsonb", nullable: true })
  price_overrides!: Record<string, unknown> | null;

  @Column({ type: "integer", nullable: true })
  weight_grams!: number | null;

  @Column({ type: "jsonb", nullable: true })
  dimensions_cm!: Record<string, unknown> | null;

  @Column({ type: "boolean", default: true })
  is_active!: boolean;

  @Column({ type: "smallint", default: 0 })
  sort_order!: number;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
