import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { TicketPriority, TicketStatus } from "../enums.ts";
import type { Order } from "./order.entity.ts";
import type { User } from "./user.entity.ts";

@Entity("support_tickets")
export class SupportTicket {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index({ unique: true, where: "deleted_at IS NULL" })
  @Column({ type: "varchar", length: 30, unique: true })
  ticket_number!: string;

  @Column({ type: "uuid", nullable: true })
  user_id!: string | null;

  @ManyToOne("User", { nullable: true })
  @JoinColumn({ name: "user_id" })
  user!: User | null;

  @Index("idx_support_tickets_guest_session", { where: "deleted_at IS NULL" })
  @Column({ type: "varchar", length: 255, nullable: true })
  guest_session!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  guest_email!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  guest_name!: string | null;

  @Index("idx_support_tickets_slack_thread", { where: "deleted_at IS NULL" })
  @Column({ type: "varchar", length: 64, nullable: true })
  slack_thread_ts!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  slack_channel_id!: string | null;

  @Column({ type: "uuid", nullable: true })
  assigned_to!: string | null;

  @ManyToOne("User", { nullable: true })
  @JoinColumn({ name: "assigned_to" })
  assignedToUser!: User | null;

  @Column({ type: "uuid", nullable: true })
  order_id!: string | null;

  @ManyToOne("Order", { nullable: true })
  @JoinColumn({ name: "order_id" })
  order!: Order | null;

  @Column({ type: "varchar", length: 255 })
  subject!: string;

  @Column({ type: "enum", enum: TicketStatus, default: TicketStatus.open })
  status!: TicketStatus;

  @Column({ type: "enum", enum: TicketPriority, default: TicketPriority.medium })
  priority!: TicketPriority;

  @Column({ type: "varchar", length: 100, nullable: true })
  category!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  resolved_at!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
