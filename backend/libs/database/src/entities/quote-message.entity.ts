import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { QuoteRequestVendor } from "./quote-request-vendor.entity.ts";
import type { QuoteAttachment } from "./quote-request.entity.ts";

/** A message in the thread between the buyer and one supplier. */
@Check("CHK_quote_messages_sender_role", `"sender_role" IN ('buyer', 'vendor', 'system')`)
@Entity("quote_messages")
@Index(["quote_request_vendor_id", "created_at"])
export class QuoteMessage {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  quote_request_vendor_id!: string;

  @ManyToOne("QuoteRequestVendor", "messages", { onDelete: "CASCADE" })
  @JoinColumn({ name: "quote_request_vendor_id" })
  requestVendor!: QuoteRequestVendor;

  @Column({ type: "uuid" })
  quote_request_id!: string;

  /** Null for system notes (e.g. "Quote revised"). */
  @Column({ type: "uuid", nullable: true })
  sender_id!: string | null;

  /** buyer | vendor | system */
  @Column({ type: "varchar", length: 10 })
  sender_role!: string;

  @Column({ type: "text" })
  body!: string;

  @Column({ type: "jsonb", default: [] })
  attachments!: QuoteAttachment[];

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;
}
