import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { ReelAuthorKind, ReelStatus } from "../enums.ts";
import type { ReelProductTag } from "./reel-product-tag.entity.ts";
import type { User } from "./user.entity.ts";

@Entity("reels")
export class Reel {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  user_id!: string;

  @ManyToOne("User")
  @JoinColumn({ name: "user_id" })
  user!: User;

  @Column({ type: "text", default: "cloudflare_stream" })
  video_provider!: string;

  @Column({ type: "text" })
  video_asset_id!: string;

  @Column({ type: "text" })
  video_playback_url!: string;

  @Column({ type: "int" })
  video_duration_seconds!: number;

  @Column({ type: "int" })
  video_width!: number;

  @Column({ type: "int" })
  video_height!: number;

  @Column({ type: "text" })
  thumbnail_url!: string;

  @Column({ type: "text", nullable: true })
  caption!: string | null;

  @Column({ type: "enum", enum: ReelAuthorKind, default: ReelAuthorKind.customer })
  author_kind!: ReelAuthorKind;

  @Column({ type: "boolean", default: false })
  is_verified_buyer!: boolean;

  @Column({ type: "text" })
  language_code!: string;

  @Column({ type: "boolean", default: false })
  is_sponsored_disclosed!: boolean;

  @Column({ type: "enum", enum: ReelStatus, default: ReelStatus.draft })
  status!: ReelStatus;

  @Column({ type: "text", nullable: true })
  rejection_reason!: string | null;

  @Column({ type: "numeric", precision: 5, scale: 4, nullable: true })
  risk_score!: string | null;

  @Column({ type: "jsonb", default: () => "'{}'::jsonb" })
  auto_flags!: Record<string, unknown>;

  @Column({ type: "text", nullable: true })
  auto_review_result!: string | null;

  @Column({ type: "uuid", nullable: true })
  moderator_id!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  moderated_at!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  published_at!: Date | null;

  @Column({ type: "int", default: 0 })
  like_count!: number;

  @Column({ type: "int", default: 0 })
  view_count!: number;

  @Column({ type: "int", default: 0 })
  save_count!: number;

  @Column({ type: "int", default: 0 })
  share_count!: number;

  @Column({ type: "int", default: 0 })
  unique_viewer_count!: number;

  @Column({ type: "numeric", precision: 12, scale: 4, default: 0 })
  ranking_score!: string;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;

  @OneToMany("ReelProductTag", (tag: ReelProductTag) => tag.reel)
  tags!: ReelProductTag[];
}
