import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import type { Category } from "./category.entity.ts";
import type { Product } from "./product.entity.ts";

@Entity("product_categories")
@Unique(["product_id", "category_id"])
export class ProductCategory {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  product_id!: string;

  @ManyToOne("Product", { onDelete: "CASCADE" })
  @JoinColumn({ name: "product_id" })
  product!: Product;

  @Column({ type: "uuid" })
  category_id!: string;

  @ManyToOne("Category", { onDelete: "CASCADE" })
  @JoinColumn({ name: "category_id" })
  category!: Category;

  @Column({ type: "boolean", default: false })
  is_primary!: boolean;

  @Column({ type: "smallint", default: 0 })
  sort_order!: number;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
