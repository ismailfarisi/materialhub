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
import type { Dispute } from "./dispute.entity.ts";
import type { User } from "./user.entity.ts";

@Entity("dispute_messages")
export class DisputeMessage {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  dispute_id!: string;

  @ManyToOne("Dispute")
  @JoinColumn({ name: "dispute_id" })
  dispute!: Dispute;

  @Column({ type: "uuid" })
  sender_id!: string;

  @ManyToOne("User")
  @JoinColumn({ name: "sender_id" })
  sender!: User;

  @Column({ type: "varchar", length: 20 })
  sender_role!: string;

  @Column({ type: "text" })
  message!: string;

  @Column({ type: "jsonb", default: [] })
  attachment_urls!: string[];

  @Column({ type: "boolean", default: false })
  is_internal!: boolean;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
