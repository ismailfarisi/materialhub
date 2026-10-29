import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { ReelModerationAction } from "../enums.ts";
import type { Reel } from "./reel.entity.ts";
import type { User } from "./user.entity.ts";

@Entity("reel_moderation_log")
export class ReelModerationLog {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  reel_id!: string;

  @ManyToOne("Reel")
  @JoinColumn({ name: "reel_id" })
  reel!: Reel;

  @Column({ type: "uuid", nullable: true })
  moderator_id!: string | null;

  @ManyToOne("User", { nullable: true })
  @JoinColumn({ name: "moderator_id" })
  moderator!: User | null;

  @Column({ type: "enum", enum: ReelModerationAction })
  action!: ReelModerationAction;

  @Column({ type: "text", nullable: true })
  reason!: string | null;

  @Column({ type: "text", nullable: true })
  notes!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;
}
