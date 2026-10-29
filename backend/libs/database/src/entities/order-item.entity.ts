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
import { OrderStatus } from "../enums.ts";
import type { Order } from "./order.entity.ts";
import type { ProductVariant } from "./product-variant.entity.ts";
import type { Product } from "./product.entity.ts";
import type { VendorOrder } from "./vendor-order.entity.ts";
import type { Vendor } from "./vendor.entity.ts";

@Entity("order_items")
export class OrderItem {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  order_id!: string;

  @ManyToOne("Order", "items")
  @JoinColumn({ name: "order_id" })
  order!: Order;

  @Column({ type: "uuid" })
  vendor_order_id!: string;

  @ManyToOne("VendorOrder", "items")
  @JoinColumn({ name: "vendor_order_id" })
  vendorOrder!: VendorOrder;

  @Column({ type: "uuid" })
  vendor_id!: string;

  @ManyToOne("Vendor")
  @JoinColumn({ name: "vendor_id" })
  vendor!: Vendor;

  @Column({ type: "uuid" })
  product_id!: string;

  @ManyToOne("Product", "orderItems")
  @JoinColumn({ name: "product_id" })
  product!: Product;

  @Column({ type: "uuid", nullable: true })
  variant_id!: string | null;

  @ManyToOne("ProductVariant", { nullable: true })
  @JoinColumn({ name: "variant_id" })
  variant!: ProductVariant | null;

  @Column({ type: "varchar", length: 255 })
  product_name!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  variant_name!: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  product_sku!: string | null;

  @Column({ type: "varchar", length: 128, nullable: true })
  external_id!: string | null;

  @Column({ type: "varchar", length: 1024, nullable: true })
  product_image_url!: string | null;

  @Column({ type: "jsonb", nullable: true })
  product_snapshot!: Record<string, unknown> | null;

  @Column({ type: "integer" })
  quantity!: number;

  @Column({ type: "integer" })
  unit_price!: number;

  @Column({ type: "integer", nullable: true })
  compare_at_price!: number | null;

  @Column({ type: "integer", default: 0 })
  discount_amount!: number;

  @Column({ type: "integer", default: 0 })
  tax_amount!: number;

  @Column({ type: "numeric", precision: 5, scale: 2, default: 5 })
  tax_rate!: number;

  @Column({ type: "integer" })
  line_total!: number;

  @Column({ type: "integer", default: 0 })
  refunded_quantity!: number;

  @Column({ type: "integer", default: 0 })
  refunded_amount!: number;

  @Column({ type: "boolean", default: false })
  is_reviewed!: boolean;

  @Column({ type: "enum", enum: OrderStatus, default: OrderStatus.confirmed })
  status!: OrderStatus;

  @Column({ type: "jsonb", nullable: true })
  customization_data!: Record<string, unknown> | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
