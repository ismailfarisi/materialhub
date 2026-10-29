import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import type { User } from "./user.entity.ts";

@Entity("user_sessions")
export class UserSession {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  user_id!: string;

  @ManyToOne("User", "sessions", { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: User;

  @Column({ type: "varchar", length: 255 })
  refresh_token_hash!: string;

  @Column({ type: "jsonb", nullable: true })
  device_info!: Record<string, unknown> | null;

  @Column({ type: "varchar", length: 45, nullable: true })
  ip_address!: string | null;

  @Column({ type: "timestamptz" })
  expires_at!: Date;

  @Column({ type: "boolean", default: false })
  is_revoked!: boolean;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
