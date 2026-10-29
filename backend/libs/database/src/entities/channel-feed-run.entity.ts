import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

// Operational log table — intentionally no soft-delete (deleted_at); aged out by hard-delete retention.
@Entity("channel_feed_runs")
@Index("channel_feed_runs_channel_created_idx", ["channel_id", "created_at"])
export class ChannelFeedRun {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  channel_id!: string;

  @Column({ type: "timestamptz" })
  started_at!: Date;

  @Column({ type: "timestamptz", nullable: true })
  finished_at!: Date | null;

  @Column({ type: "varchar", length: 16 })
  status!: string;

  @Column({ type: "integer", default: 0 })
  item_count!: number;

  @Column({ type: "integer", default: 0 })
  excluded_count!: number;

  @Column({ type: "integer", default: 0 })
  error_count!: number;

  @Column({ type: "text", nullable: true })
  file_url!: string | null;

  @Column({ type: "integer", nullable: true })
  file_size_bytes!: number | null;

  @Column({ type: "varchar", length: 8 })
  trigger!: string;

  @Column({ type: "text", nullable: true })
  error_message!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;
}
