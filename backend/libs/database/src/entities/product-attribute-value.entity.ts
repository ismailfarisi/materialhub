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
import type { Attribute } from "./attribute.entity.ts";
import type { ProductVariant } from "./product-variant.entity.ts";
import type { Product } from "./product.entity.ts";

@Entity("product_attribute_values")
export class ProductAttributeValue {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  product_id!: string;

  @ManyToOne("Product", "attributeValues")
  @JoinColumn({ name: "product_id" })
  product!: Product;

  @Column({ type: "uuid", nullable: true })
  variant_id!: string | null;

  @ManyToOne("ProductVariant", { nullable: true })
  @JoinColumn({ name: "variant_id" })
  variant!: ProductVariant | null;

  @Column({ type: "uuid" })
  attribute_id!: string;

  @ManyToOne("Attribute")
  @JoinColumn({ name: "attribute_id" })
  attribute!: Attribute;

  @Column({ type: "uuid", nullable: true })
  attribute_value_id!: string | null;

  @ManyToOne("AttributeValue", { nullable: true })
  @JoinColumn({ name: "attribute_value_id" })
  attributeValue!: AttributeValue | null;

  @Column({ type: "varchar", length: 500, nullable: true })
  text_value!: string | null;

  @Column({ type: "boolean", default: true })
  is_visible!: boolean;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
