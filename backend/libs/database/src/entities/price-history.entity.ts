import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { ProductVariant } from "./product-variant.entity.ts";
import type { Product } from "./product.entity.ts";
import type { User } from "./user.entity.ts";

@Entity("price_history")
export class PriceHistory {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  product_id!: string;

  @ManyToOne("Product")
  @JoinColumn({ name: "product_id" })
  product!: Product;

  @Column({ type: "uuid", nullable: true })
  variant_id!: string | null;

  @ManyToOne("ProductVariant", { nullable: true })
  @JoinColumn({ name: "variant_id" })
  variant!: ProductVariant | null;

  @Column({ type: "integer" })
  old_price!: number;

  @Column({ type: "integer" })
  new_price!: number;

  @Column({ type: "integer", nullable: true })
  old_compare_at_price!: number | null;

  @Column({ type: "integer", nullable: true })
  new_compare_at_price!: number | null;

  @Column({ type: "char", length: 3, default: "AED" })
  currency!: string;

  @Column({ type: "uuid", nullable: true })
  changed_by!: string | null;

  @ManyToOne("User", { nullable: true })
  @JoinColumn({ name: "changed_by" })
  changedByUser!: User | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  change_reason!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;
}
