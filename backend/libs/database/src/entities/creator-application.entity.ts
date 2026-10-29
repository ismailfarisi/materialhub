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
import { CreatorApplicationStatus } from "../enums.ts";
import type { User } from "./user.entity.ts";

export interface CreatorApplicationSocialLinks {
  instagram?: string | null;
  tiktok?: string | null;
  youtube?: string | null;
  other?: string | null;
}

@Entity("creator_applications")
@Index("uq_creator_app_open_per_user", ["user_id"], {
  unique: true,
  where: "deleted_at IS NULL AND status IN ('pending','needs_info')",
})
@Index("idx_creator_app_status_submitted", ["status", "submitted_at"], {
  where: "deleted_at IS NULL",
})
export class CreatorApplication {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index("idx_creator_app_user", { where: "deleted_at IS NULL" })
  @Column({ type: "uuid" })
  user_id!: string;

  @ManyToOne("User")
  @JoinColumn({ name: "user_id" })
  user!: User;

  // varchar-backed app enum; values come from CreatorApplicationStatus.
  // One OPEN (pending|needs_info) application per user is enforced by the
  // uq_creator_app_open_per_user partial unique constraint (Task 2
  // migration), mirrored above by the class-level @Index decorator.
  @Column({ type: "varchar", length: 12, default: CreatorApplicationStatus.pending })
  status!: CreatorApplicationStatus;

  @Column({ type: "varchar", length: 120 })
  display_name!: string;

  @Column({ type: "text" })
  bio!: string;

  @Column({ type: "varchar", length: 100 })
  primary_category!: string;

  @Column({ type: "jsonb", default: {} })
  social_links!: CreatorApplicationSocialLinks;

  @Column({ type: "integer", nullable: true })
  follower_estimate!: number | null;

  @Column({ type: "jsonb", nullable: true })
  sample_urls!: string[] | null;

  @Column({ type: "text", nullable: true })
  motivation!: string | null;

  @Column({ type: "timestamptz" })
  agreed_to_terms_at!: Date;

  @Column({ type: "uuid", nullable: true })
  reviewed_by!: string | null;

  @Column({ type: "text", nullable: true })
  review_notes!: string | null;

  @Column({ type: "timestamptz", default: () => "now()" })
  submitted_at!: Date;

  @Column({ type: "timestamptz", nullable: true })
  reviewed_at!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
