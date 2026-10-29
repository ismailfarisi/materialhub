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
import { RelationType } from "../enums.ts";
import type { Product } from "./product.entity.ts";

@Entity("product_relations")
@Unique(["product_id", "related_product_id", "type"])
export class ProductRelation {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  product_id!: string;

  @ManyToOne("Product")
  @JoinColumn({ name: "product_id" })
  product!: Product;

  @Column({ type: "uuid" })
  related_product_id!: string;

  @ManyToOne("Product")
  @JoinColumn({ name: "related_product_id" })
  relatedProduct!: Product;

  @Column({ type: "enum", enum: RelationType })
  type!: RelationType;

  @Column({ type: "smallint", default: 0 })
  sort_order!: number;

  @Column({ type: "boolean", default: false })
  is_auto!: boolean;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
