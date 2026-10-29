import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { User } from "./user.entity.ts";

@Entity("recent_searches")
@Index(["user_id", "last_used_at"])
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
