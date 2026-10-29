import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";
import { ChannelDeliveryKind } from "../enums/channel.enums.ts";

// Append-only audit log — intentionally no updated_at / deleted_at; aged out by hard-delete retention.
@Entity("channel_deliveries")
@Index("channel_deliveries_channel_created_idx", ["channel_id", "created_at"])
export class ChannelDelivery {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  channel_id!: string;

  @Column({ type: "enum", enum: ChannelDeliveryKind })
  kind!: ChannelDeliveryKind;

  @Column({ type: "varchar", length: 48, nullable: true })
  event_name!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  dedup_event_id!: string | null;

  @Column({ type: "uuid", nullable: true })
  order_id!: string | null;

  @Column({ type: "uuid", nullable: true })
  product_id!: string | null;

  @Column({ type: "jsonb", nullable: true })
  payload!: Record<string, unknown> | null;

  @Column({ type: "integer", nullable: true })
  response_status!: number | null;

  @Column({ type: "varchar", length: 16 })
  status!: string;

  @Column({ type: "integer", nullable: true })
  latency_ms!: number | null;

  @Column({ type: "smallint", default: 1 })
  attempt!: number;

  @Column({ type: "text", nullable: true })
  error_message!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;
}
