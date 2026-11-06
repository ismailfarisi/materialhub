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
import { QuoteResponseStatus } from "../enums/quote.enums.ts";
import type { ProductVariant } from "./product-variant.entity.ts";
import type { Product } from "./product.entity.ts";
import type { QuoteRequestVendor } from "./quote-request-vendor.entity.ts";
import type { Vendor } from "./vendor.entity.ts";

/**
 * A supplier's priced answer to a request. Revising a quote writes a new row
 * and marks the previous one superseded, so the buyer's view of what was
 * offered is never rewritten.
 */
@Check(
  "CHK_quote_responses_status",
  `"status" IN ('submitted', 'superseded', 'accepted', 'declined')`,
)
@Check("CHK_quote_responses_amounts", `"unit_price" > 0 AND "moq" > 0 AND "lead_time_days" >= 0`)
@Entity("quote_responses")
@Index(["quote_request_vendor_id", "created_at"])
export class QuoteResponse {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  quote_request_vendor_id!: string;

  @ManyToOne("QuoteRequestVendor", "responses", { onDelete: "CASCADE" })
  @JoinColumn({ name: "quote_request_vendor_id" })
  requestVendor!: QuoteRequestVendor;

  @Column({ type: "uuid" })
  quote_request_id!: string;

  @Column({ type: "uuid" })
  vendor_id!: string;

  @ManyToOne("Vendor")
  @JoinColumn({ name: "vendor_id" })
  vendor!: Vendor;

  /** The supplier's listing that fulfils the quote; accepting adds it to the cart. */
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

  /** Price per unit of the request's unit, in fils. */
  @Column({ type: "integer" })
  unit_price!: number;

  @Column({ type: "varchar", length: 3, default: "AED" })
  currency!: string;

  /** Minimum order quantity at this price, in the request's unit. */
  @Column({ type: "integer" })
  moq!: number;

  @Column({ type: "integer" })
  lead_time_days!: number;

  /** Last day the buyer can accept (inclusive, Asia/Dubai). */
  @Column({ type: "date" })
  valid_until!: string;

  @Column({ type: "text", nullable: true })
  notes!: string | null;

  @Column({ type: "varchar", length: 16, default: QuoteResponseStatus.submitted })
  status!: QuoteResponseStatus;

  @Column({ type: "uuid" })
  responded_by!: string;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;
}
