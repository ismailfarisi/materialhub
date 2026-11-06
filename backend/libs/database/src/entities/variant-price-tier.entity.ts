import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import type { ProductVariant } from "./product-variant.entity.ts";
import type { Product } from "./product.entity.ts";

/**
 * A quantity-break price: from `min_quantity` units up, each unit costs
 * `unit_price` fils. Below the lowest tier the variant's (or, for a product
 * without variants, the product's) base `price` applies.
 *
 * `variant_id` is null for tiers on a simple product (one without variants);
 * otherwise the tier belongs to that variant. Rows are replaced as a set when
 * a vendor saves the tier table, so they carry no soft-delete column.
 */
@Entity("variant_price_tiers")
@Index("UQ_variant_price_tiers_variant_min", ["variant_id", "min_quantity"], {
  unique: true,
  where: "variant_id IS NOT NULL",
})
@Index("UQ_variant_price_tiers_product_min", ["product_id", "min_quantity"], {
  unique: true,
  where: "variant_id IS NULL",
})
@Check("CHK_variant_price_tiers_min_quantity", `"min_quantity" >= 2`)
@Check("CHK_variant_price_tiers_unit_price", `"unit_price" >= 0`)
export class VariantPriceTier {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index("IDX_variant_price_tiers_product_id")
  @Column({ type: "uuid" })
  product_id!: string;

  @ManyToOne("Product", "price_tiers", { onDelete: "CASCADE" })
  @JoinColumn({ name: "product_id", foreignKeyConstraintName: "FK_variant_price_tiers_product" })
  product!: Product;

  @Column({ type: "uuid", nullable: true })
  variant_id!: string | null;

  @ManyToOne("ProductVariant", "price_tiers", { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "variant_id", foreignKeyConstraintName: "FK_variant_price_tiers_variant" })
  variant!: ProductVariant | null;

  /** Tier applies from this many units up (counted in the listing's unit of measure). */
  @Column({ type: "integer" })
  min_quantity!: number;

  /** Unit price in fils at this tier. */
  @Column({ type: "integer" })
  unit_price!: number;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;
}
