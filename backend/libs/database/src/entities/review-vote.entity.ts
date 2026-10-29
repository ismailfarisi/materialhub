import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import type { Review } from "./review.entity.ts";
import type { User } from "./user.entity.ts";

@Entity("review_votes")
@Unique(["review_id", "user_id"])
export class ReviewVote {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  review_id!: string;

  @ManyToOne("Review", "votes")
  @JoinColumn({ name: "review_id" })
  review!: Review;

  @Column({ type: "uuid" })
  user_id!: string;

  @ManyToOne("User")
  @JoinColumn({ name: "user_id" })
  user!: User;

  @Column({ type: "boolean" })
  is_helpful!: boolean;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
