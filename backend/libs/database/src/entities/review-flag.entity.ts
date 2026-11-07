import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import type { Review } from "./review.entity.ts";
import type { User } from "./user.entity.ts";

/**
 * One buyer's report of an approved review. A single report no longer hides
 * the review: it stays published and shows up in the admin moderation queue,
 * and only once REVIEW_FLAG_HIDE_THRESHOLD distinct buyers have reported it
 * does it move to `flagged` (hidden until a moderator decides). One row per
 * (review, user) so repeat clicks do not count twice.
 */
@Entity("review_flags")
@Unique("uq_review_flags_review_user", ["review_id", "user_id"])
@Index("idx_review_flags_review", ["review_id"])
export class ReviewFlag {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  review_id!: string;

  @ManyToOne("Review", { onDelete: "CASCADE" })
  @JoinColumn({ name: "review_id" })
  review!: Review;

  @Column({ type: "uuid" })
  user_id!: string;

  @ManyToOne("User", { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: User;

  @Column({ type: "varchar", length: 500, nullable: true })
  reason!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;
}
