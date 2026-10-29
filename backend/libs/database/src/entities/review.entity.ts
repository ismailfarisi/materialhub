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
import { ReviewStatus } from "../enums.ts";
import type { OrderItem } from "./order-item.entity.ts";
import type { ProductVariant } from "./product-variant.entity.ts";
import type { Product } from "./product.entity.ts";
import type { ReviewVote } from "./review-vote.entity.ts";
import type { User } from "./user.entity.ts";
import type { Vendor } from "./vendor.entity.ts";

@Entity("reviews")
export class Review {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  product_id!: string;

  @ManyToOne("Product", "reviews")
  @JoinColumn({ name: "product_id" })
  product!: Product;

  @Column({ type: "uuid" })
  vendor_id!: string;

  @ManyToOne("Vendor")
  @JoinColumn({ name: "vendor_id" })
  vendor!: Vendor;

  @Column({ type: "uuid" })
  user_id!: string;

  @ManyToOne("User", "reviews")
  @JoinColumn({ name: "user_id" })
  user!: User;

  @Index({ unique: true, where: "deleted_at IS NULL" })
  @Column({ type: "uuid", unique: true })
  order_item_id!: string;

  @ManyToOne("OrderItem")
  @JoinColumn({ name: "order_item_id" })
  orderItem!: OrderItem;

  @Column({ type: "uuid", nullable: true })
  variant_id!: string | null;

  @ManyToOne("ProductVariant", { nullable: true })
  @JoinColumn({ name: "variant_id" })
  variant!: ProductVariant | null;

  @Column({ type: "smallint" })
  rating!: number;

  @Column({ type: "varchar", length: 255, nullable: true })
  title!: string | null;

  @Column({ type: "text", nullable: true })
  body!: string | null;

  @Column({ type: "jsonb", default: [] })
  media_urls!: string[];

  @Column({ type: "enum", enum: ReviewStatus, default: ReviewStatus.pending })
  status!: ReviewStatus;

  @Column({ type: "timestamptz", nullable: true })
  approved_at!: Date | null;

  @Column({ type: "uuid", nullable: true })
  approved_by!: string | null;

  @Column({ type: "text", nullable: true })
  rejection_reason!: string | null;

  @Column({ type: "text", nullable: true })
  vendor_reply!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  vendor_replied_at!: Date | null;

  @Column({ type: "integer", default: 0 })
  helpful_count!: number;

  @Column({ type: "integer", default: 0 })
  not_helpful_count!: number;

  @Column({ type: "boolean", default: true })
  is_verified_purchase!: boolean;

  @Column({ type: "boolean", default: false })
  is_featured!: boolean;

  @Column({ type: "smallint", nullable: true })
  quality_rating!: number | null;

  @Column({ type: "smallint", nullable: true })
  value_rating!: number | null;

  @Column({ type: "smallint", nullable: true })
  shipping_rating!: number | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;

  @OneToMany("ReviewVote", "review")
  votes!: ReviewVote[];
}
