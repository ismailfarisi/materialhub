import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { ProductStatus } from "../enums.ts";
import type { Brand } from "./brand.entity.ts";
import type { Category } from "./category.entity.ts";
import type { Inventory } from "./inventory.entity.ts";
import type { OrderItem } from "./order-item.entity.ts";
import type { ProductAttributeValue } from "./product-attribute-value.entity.ts";
import type { ProductCategory } from "./product-category.entity.ts";
import type { ProductImage } from "./product-image.entity.ts";
import type { ProductTranslation } from "./product-translation.entity.ts";
import type { ProductVariant } from "./product-variant.entity.ts";
import type { Review } from "./review.entity.ts";
import type { Vendor } from "./vendor.entity.ts";

@Entity("products")
export class Product {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  vendor_id!: string;

  @ManyToOne("Vendor", "products")
  @JoinColumn({ name: "vendor_id" })
  vendor!: Vendor;

  @Column({ type: "uuid" })
  category_id!: string;

  @ManyToOne("Category")
  @JoinColumn({ name: "category_id" })
  category!: Category;

  @Column({ type: "uuid", nullable: true })
  brand_id!: string | null;

  @ManyToOne("Brand", { nullable: true })
  @JoinColumn({ name: "brand_id" })
  brand!: Brand | null;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Index({ unique: true, where: "deleted_at IS NULL" })
  @Column({ type: "varchar", length: 255, unique: true })
  slug!: string;

  @Column({ type: "text", nullable: true })
  short_description!: string | null;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "jsonb", nullable: true })
  rich_description!: Record<string, unknown> | null;

  @Column({ type: "jsonb", nullable: true })
  editorial!: Record<string, unknown> | null;

  @Column({ type: "text", nullable: true })
  ingredients!: string | null;

  @Column({ type: "text", nullable: true })
  usage_instructions!: string | null;

  @Column({ type: "integer" })
  price!: number;

  @Column({ type: "integer", nullable: true })
  compare_at_price!: number | null;

  @Column({ type: "integer", nullable: true })
  cost_price!: number | null;

  @Column({ type: "char", length: 3, default: "AED" })
  currency!: string;

  @Column({ type: "jsonb", nullable: true })
  price_overrides!: Record<string, unknown> | null;

  @Column({ type: "boolean", default: false })
  is_vat_inclusive!: boolean;

  @Column({ type: "uuid", nullable: true })
  tax_rate_id!: string | null;

  @Column({
    type: "enum",
    enum: ProductStatus,
    default: ProductStatus.draft,
  })
  status!: ProductStatus;

  @Column({ type: "timestamptz", nullable: true })
  published_at!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  reviewed_at!: Date | null;

  @Column({ type: "uuid", nullable: true })
  reviewed_by!: string | null;

  @Column({ type: "text", nullable: true })
  rejection_reason!: string | null;

  @Column({ type: "integer", nullable: true })
  weight_grams!: number | null;

  @Column({ type: "jsonb", nullable: true })
  dimensions_cm!: Record<string, unknown> | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  sku!: string | null;

  @Column({ type: "varchar", length: 128, nullable: true })
  external_id!: string | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  barcode!: string | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  mpn!: string | null;

  @Column({ type: "char", length: 2, nullable: true })
  country_of_origin!: string | null;

  @Column({ type: "boolean", default: false })
  is_featured!: boolean;

  @Column({ type: "boolean", default: false })
  is_digital!: boolean;

  @Column({ type: "boolean", default: false })
  is_customizable!: boolean;

  @Column({ type: "boolean", default: true })
  requires_shipping!: boolean;

  @Column({ type: "boolean", default: false })
  is_age_restricted!: boolean;

  @Column({ type: "smallint", nullable: true })
  minimum_age!: number | null;

  @Column({ type: "boolean", default: true })
  track_inventory!: boolean;

  @Column({ type: "boolean", default: false })
  allow_backorder!: boolean;

  @Column({ type: "boolean", default: false })
  has_variants!: boolean;

  @Column({ type: "boolean", default: false })
  is_gift_eligible!: boolean;

  @Column({ type: "boolean", default: false })
  is_gift_only!: boolean;

  @Column({ type: "numeric", precision: 3, scale: 2, default: 0 })
  rating_avg!: number;

  @Column({ type: "integer", default: 0 })
  rating_count!: number;

  @Column({ type: "integer", default: 0 })
  view_count!: number;

  @Column({ type: "integer", default: 0 })
  sales_count!: number;

  @Column({ type: "integer", default: 0 })
  wishlist_count!: number;

  @Column({ type: "text", array: true, nullable: true })
  tags!: string[] | null;

  @Column({ type: "jsonb", nullable: true })
  attributes!: Record<string, unknown> | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  meta_title!: string | null;

  @Column({ type: "text", nullable: true })
  meta_description!: string | null;

  @Column({ type: "text", nullable: true })
  meta_keywords!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;

  @OneToMany("ProductTranslation", "product")
  translations!: ProductTranslation[];

  @OneToMany("ProductImage", "product")
  images!: ProductImage[];

  @OneToMany("ProductVariant", "product")
  variants!: ProductVariant[];

  @OneToMany("ProductCategory", "product")
  productCategories!: ProductCategory[];

  @OneToMany("ProductAttributeValue", "product")
  attributeValues!: ProductAttributeValue[];

  @OneToMany("OrderItem", "product")
  orderItems!: OrderItem[];

  @OneToMany("Review", "product")
  reviews!: Review[];

  @OneToMany("Inventory", "product")
  inventoryRecords!: Inventory[];
}
