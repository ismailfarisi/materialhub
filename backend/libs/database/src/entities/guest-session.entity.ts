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

@Entity("guest_sessions")
export class GuestSession {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 255, unique: true })
  session_token!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  fingerprint_hash!: string | null;

  @Column({ type: "varchar", length: 45, nullable: true })
  ip_address!: string | null;

  @Column({ type: "varchar", length: 512, nullable: true })
  user_agent!: string | null;

  @Column({ type: "varchar", length: 10, default: "en" })
  preferred_locale!: string;

  @Column({ type: "varchar", length: 3, default: "AED" })
  preferred_currency!: string;

  @Column({ type: "uuid", nullable: true })
  merged_to_user_id!: string | null;

  @ManyToOne("User", { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "merged_to_user_id" })
  merged_to_user!: User | null;

  @Column({ type: "timestamptz", nullable: true })
  merged_at!: Date | null;

  @Column({ type: "timestamptz", default: () => "now()" })
  last_active_at!: Date;

  @Column({ type: "timestamptz" })
  expires_at!: Date;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
