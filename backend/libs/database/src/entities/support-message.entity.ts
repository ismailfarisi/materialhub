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
import type { SupportTicket } from "./support-ticket.entity.ts";
import type { User } from "./user.entity.ts";

@Entity("support_messages")
export class SupportMessage {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  ticket_id!: string;

  @ManyToOne("SupportTicket")
  @JoinColumn({ name: "ticket_id" })
  ticket!: SupportTicket;

  @Column({ type: "uuid", nullable: true })
  sender_id!: string | null;

  @ManyToOne("User", { nullable: true })
  @JoinColumn({ name: "sender_id" })
  sender!: User | null;

  @Column({ type: "varchar", length: 20 })
  sender_role!: string;

  @Column({ type: "text" })
  message!: string;

  @Column({ type: "jsonb", default: [] })
  attachment_urls!: string[];

  @Column({ type: "boolean", default: false })
  is_internal!: boolean;

  @Column({ type: "varchar", length: 16, default: "app" })
  origin!: string;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
