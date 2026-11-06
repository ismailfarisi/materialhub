import {
  Check,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import type { Cart } from "./cart.entity.ts";
import type { ProductVariant } from "./product-variant.entity.ts";
import type { Product } from "./product.entity.ts";
import type { QuoteResponse } from "./quote-response.entity.ts";
import type { Vendor } from "./vendor.entity.ts";

@Check("CHK_cart_items_quote_price", `("quote_id" IS NULL) = ("quoted_unit_price" IS NULL)`)
@Index("IDX_cart_items_quote_id", ["quote_id"], { where: `"quote_id" IS NOT NULL` })
@Entity("cart_items")
@Unique(["cart_id", "product_id", "variant_id"])
export class CartItem {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  cart_id!: string;

  @ManyToOne("Cart", { onDelete: "CASCADE" })
  @JoinColumn({ name: "cart_id" })
  cart!: Cart;

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

  @Column({ type: "uuid" })
  vendor_id!: string;

  @ManyToOne("Vendor")
  @JoinColumn({ name: "vendor_id" })
  vendor!: Vendor;

  @Column({ type: "integer", default: 1 })
  quantity!: number;

  @Column({ type: "integer" })
  unit_price!: number;

  @Column({ type: "integer", nullable: true })
  compare_at_price!: number | null;

  @Column({ type: "integer", nullable: true })
  original_unit_price!: number | null;

  @Column({ type: "integer" })
  line_total!: number;

  // ── RFQ: a line added by accepting a supplier's quote ─────────────────
  // The accepted quote response, and the per-unit price it locked in (fils).
  // While set, quoted_unit_price wins over tier and base price (see
  // order-service domain/cart/price-resolution.ts).
  @Column({ type: "uuid", nullable: true })
  quote_id!: string | null;

  @ManyToOne("QuoteResponse", { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "quote_id" })
  quote!: QuoteResponse | null;

  @Column({ type: "integer", nullable: true })
  quoted_unit_price!: number | null;

  @Column({ type: "jsonb", nullable: true })
  customization_data!: Record<string, unknown> | null;

  @Column({ type: "timestamptz", default: () => "NOW()" })
  added_at!: Date;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
