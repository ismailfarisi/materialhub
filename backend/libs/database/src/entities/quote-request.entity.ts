import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { QuoteRequestStatus } from "../enums/quote.enums.ts";
import type { Category } from "./category.entity.ts";
import type { ProductVariant } from "./product-variant.entity.ts";
import type { Product } from "./product.entity.ts";
import type { QuoteRequestVendor } from "./quote-request-vendor.entity.ts";
import type { User } from "./user.entity.ts";

/** A file the buyer attached (a dieline, a spec sheet, a photo of a sample). */
export interface QuoteAttachment {
  /** Object key under `private/quotes/`, from the media presign endpoint. */
  key: string;
  filename: string;
  content_type: string;
}

/**
 * A buyer's request for quotation, sent to up to three suppliers.
 * Each supplier's side lives in `quote_request_vendors`.
 */
@Check(
  "CHK_quote_requests_status",
  `"status" IN ('open', 'quoted', 'accepted', 'cancelled', 'closed')`,
)
@Check(
  "CHK_quote_requests_unit",
  `"unit" IN ('sheet', 'roll', 'metre', 'pack', 'carton', 'piece', 'kg')`,
)
@Check("CHK_quote_requests_quantity", `"quantity" > 0`)
@Entity("quote_requests")
@Index(["buyer_id", "created_at"])
export class QuoteRequest {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  /** Human reference, e.g. RFQ-2026-000042. */
  @Column({ type: "varchar", length: 30, unique: true })
  request_number!: string;

  @Column({ type: "uuid" })
  buyer_id!: string;

  @ManyToOne("User")
  @JoinColumn({ name: "buyer_id" })
  buyer!: User;

  /** Set when the request started from a product page. */
  @Column({ type: "uuid", nullable: true })
  product_id!: string | null;

  @ManyToOne("Product", { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "product_id" })
  product!: Product | null;

  @Column({ type: "uuid", nullable: true })
  variant_id!: string | null;

  @ManyToOne("ProductVariant", { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "variant_id" })
  variant!: ProductVariant | null;

  /** Set when the request started from a category page. */
  @Column({ type: "uuid", nullable: true })
  category_id!: string | null;

  @ManyToOne("Category", { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "category_id" })
  category!: Category | null;

  /** Short name for lists, e.g. "Greyboard 2.0 mm, 70 × 100 cm". */
  @Column({ type: "varchar", length: 200 })
  title!: string;

  /** Free-text specification: GSM, thickness, size, finish, print, packing. */
  @Column({ type: "text" })
  specification!: string;

  @Column({ type: "integer" })
  quantity!: number;

  /** One of QUOTE_UNITS. */
  @Column({ type: "varchar", length: 16 })
  unit!: string;

  /** The date the buyer needs the goods by (calendar date, Asia/Dubai). */
  @Column({ type: "date", nullable: true })
  need_by!: string | null;

  /** One of QUOTE_EMIRATES. */
  @Column({ type: "varchar", length: 32 })
  delivery_emirate!: string;

  @Column({ type: "jsonb", default: [] })
  attachments!: QuoteAttachment[];

  @Column({ type: "varchar", length: 16, default: QuoteRequestStatus.open })
  status!: QuoteRequestStatus;

  /** The response the buyer accepted, once accepted. */
  @Column({ type: "uuid", nullable: true })
  accepted_response_id!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  accepted_at!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  cancelled_at!: Date | null;

  @OneToMany("QuoteRequestVendor", "quoteRequest")
  vendors!: QuoteRequestVendor[];

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;
}
