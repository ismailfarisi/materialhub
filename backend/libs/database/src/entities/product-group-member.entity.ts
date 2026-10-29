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
import type { AttributeValue } from "./attribute-value.entity.ts";
import type { ProductGroup } from "./product-group.entity.ts";
import type { Product } from "./product.entity.ts";

@Entity("product_group_members")
export class ProductGroupMember {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  group_id!: string;

  @ManyToOne("ProductGroup", { onDelete: "CASCADE" })
  @JoinColumn({ name: "group_id" })
  group!: ProductGroup;

  @Column({ type: "uuid" })
  product_id!: string;

  @ManyToOne("Product")
  @JoinColumn({ name: "product_id" })
  product!: Product;

  @Column({ type: "uuid" })
  attribute_value_id!: string;

  @ManyToOne("AttributeValue")
  @JoinColumn({ name: "attribute_value_id" })
  attributeValue!: AttributeValue;

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
