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
import type { User } from "./user.entity.ts";

export type CreatorPortfolioVideoKind = "sample" | "intro";

/**
 * A creator's profile-only showcase video — either one of up to 6 sample
 * clips, or the single introductory video. Never enters the public Reels
 * feed or moderation queue; uploaded via a plain S3 presign/finalize flow
 * (backend/libs/utils/src/asset-type-config.ts `creator_portfolio_video`),
 * not Cloudflare Stream.
 */
@Entity("creator_portfolio_videos")
@Index("uq_portfolio_intro_per_user", ["user_id"], {
  unique: true,
  where: "kind = 'intro' AND deleted_at IS NULL",
})
@Index("idx_portfolio_user_kind", ["user_id", "kind", "created_at"], {
  where: "deleted_at IS NULL",
})
export class CreatorPortfolioVideo {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  user_id!: string;

  @ManyToOne("User")
  @JoinColumn({ name: "user_id" })
  user!: User;

  // varchar-backed app enum ("sample" | "intro") — matches every other
  // app-enum column in this schema neighbourhood (creator_applications.status,
  // collab_opportunities.type, etc.). No Postgres enum type.
  @Column({ type: "varchar", length: 10 })
  kind!: CreatorPortfolioVideoKind;

  @Column({ type: "text" })
  video_url!: string;

  @Column({ type: "varchar", length: 50 })
  content_type!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  caption!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
