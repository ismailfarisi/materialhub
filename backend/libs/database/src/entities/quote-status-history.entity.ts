import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { QuoteRequest } from "./quote-request.entity.ts";

/** Append-only log of every status change on a request, a supplier side or a response. */
@Entity("quote_status_history")
@Index(["quote_request_id", "created_at"])
export class QuoteStatusHistory {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  quote_request_id!: string;

  @ManyToOne("QuoteRequest", { onDelete: "CASCADE" })
  @JoinColumn({ name: "quote_request_id" })
  quoteRequest!: QuoteRequest;

  /** Set when the change is on one supplier's side. */
  @Column({ type: "uuid", nullable: true })
  quote_request_vendor_id!: string | null;

  /** request | vendor | response */
  @Column({ type: "varchar", length: 10 })
  subject!: string;

  @Column({ type: "varchar", length: 20, nullable: true })
  from_status!: string | null;

  @Column({ type: "varchar", length: 20 })
  to_status!: string;

  /** buyer | vendor | admin | system */
  @Column({ type: "varchar", length: 10 })
  actor_role!: string;

  @Column({ type: "uuid", nullable: true })
  actor_id!: string | null;

  @Column({ type: "text", nullable: true })
  note!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;
}
