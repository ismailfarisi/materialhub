import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { SalesChannelCode } from "../enums/channel.enums.ts";

@Entity("sales_channels")
@Index("sales_channels_code_uq", ["code"], { unique: true, where: "deleted_at IS NULL" })
export class SalesChannel {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "enum", enum: SalesChannelCode })
  code!: SalesChannelCode;

  @Column({ type: "varchar", length: 100 })
  display_name!: string;

  @Column({ type: "boolean", default: false })
  is_enabled!: boolean;

  @Column({ type: "text", nullable: true })
  credentials_encrypted!: string | null;

  @Column({ type: "jsonb", default: {} })
  config!: Record<string, unknown>;

  @Column({ type: "text", nullable: true })
  feed_url!: string | null;

  @Column({ type: "varchar", length: 8, default: "xml" })
  feed_format!: string;

  @Column({ type: "boolean", default: true })
  delta_enabled!: boolean;

  @Column({ type: "timestamptz", nullable: true })
  last_full_feed_at!: Date | null;

  @Column({ type: "varchar", length: 16, nullable: true })
  last_full_feed_status!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  last_delta_success_at!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  degraded_until!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
