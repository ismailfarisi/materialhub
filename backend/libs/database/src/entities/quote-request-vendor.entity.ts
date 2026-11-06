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
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { QuoteVendorStatus } from "../enums/quote.enums.ts";
import type { QuoteMessage } from "./quote-message.entity.ts";
import type { QuoteRequest } from "./quote-request.entity.ts";
import type { QuoteResponse } from "./quote-response.entity.ts";
import type { Vendor } from "./vendor.entity.ts";

/**
 * One supplier's side of a request: its status, its responses and the
 * message thread between the buyer and that supplier.
 */
@Check(
  "CHK_quote_request_vendors_status",
  `"status" IN ('pending', 'responded', 'vendor_declined', 'buyer_declined', 'accepted', 'not_selected', 'cancelled')`,
)
@Entity("quote_request_vendors")
@Unique(["quote_request_id", "vendor_id"])
@Index(["vendor_id", "status"])
export class QuoteRequestVendor {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  quote_request_id!: string;

  @ManyToOne("QuoteRequest", "vendors", { onDelete: "CASCADE" })
  @JoinColumn({ name: "quote_request_id" })
  quoteRequest!: QuoteRequest;

  @Column({ type: "uuid" })
  vendor_id!: string;

  @ManyToOne("Vendor")
  @JoinColumn({ name: "vendor_id" })
  vendor!: Vendor;

  @Column({ type: "varchar", length: 20, default: QuoteVendorStatus.pending })
  status!: QuoteVendorStatus;

  /** The supplier's live response (the latest one that isn't superseded). */
  @Column({ type: "uuid", nullable: true })
  current_response_id!: string | null;

  /** Why the supplier declined, shown to the buyer. */
  @Column({ type: "text", nullable: true })
  decline_reason!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  last_message_at!: Date | null;

  @OneToMany("QuoteResponse", "requestVendor")
  responses!: QuoteResponse[];

  @OneToMany("QuoteMessage", "requestVendor")
  messages!: QuoteMessage[];

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;
}
