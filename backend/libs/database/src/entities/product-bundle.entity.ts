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

@Entity("product_bundles")
export class ProductBundle {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  product_id!: string;

  @ManyToOne("Product", { onDelete: "CASCADE" })
  @JoinColumn({ name: "product_id" })
  product!: Product;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Column({ type: "integer" })
  bundle_price!: number;

  @Column({ type: "integer", nullable: true })
  compare_at_price!: number | null;

  @Column({ type: "numeric", precision: 5, scale: 2, nullable: true })
  discount_percentage!: number | null;

  @Column({ type: "integer", default: 1 })
  min_quantity!: number;

  @Column({ type: "integer", nullable: true })
  max_quantity!: number | null;

  @Column({ type: "boolean", default: true })
  is_active!: boolean;

  @Column({ type: "timestamptz", nullable: true })
  starts_at!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  expires_at!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
