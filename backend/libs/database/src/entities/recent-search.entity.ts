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
import type { User } from "./user.entity.ts";

@Entity("recent_searches")
@Index(["user_id", "last_used_at"])
// RecentSearchService.record upserts on (user_id, query); Postgres needs a
// matching unique constraint for ON CONFLICT.
@Unique("uq_recent_searches_user_query", ["user_id", "query"])
export class RecentSearch {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  user_id!: string;

  @ManyToOne("User", { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: User;

  @Column({ type: "text" })
  query!: string;

  @Column({ type: "timestamptz", default: () => "now()" })
  last_used_at!: Date;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;
}
