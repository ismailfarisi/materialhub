import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { WebhookStatus } from "../enums.ts";

@Entity("webhook_events")
@Unique(["gateway", "event_id"])
export class WebhookEvent {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 50 })
  gateway!: string;

  @Column({ type: "varchar", length: 100 })
  event_type!: string;

  @Column({ type: "varchar", length: 255 })
  event_id!: string;

  @Column({ type: "jsonb" })
  payload!: Record<string, unknown>;

  @Column({ type: "enum", enum: WebhookStatus, default: WebhookStatus.pending })
  status!: WebhookStatus;

  @Column({ type: "timestamptz", nullable: true })
  processed_at!: Date | null;

  @Column({ type: "text", nullable: true })
  error_message!: string | null;

  @Column({ type: "smallint", default: 0 })
  attempts!: number;

  @Column({ type: "timestamptz", nullable: true })
  last_attempt_at!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
