import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import type { User } from "./user.entity.ts";

@Entity("user_two_factor")
export class UserTwoFactor {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid", unique: true })
  user_id!: string;

  @OneToOne("User", "twoFactor", { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: User;

  @Column({ type: "text" })
  secret_encrypted!: string;

  @Column({ type: "boolean", default: false })
  is_enabled!: boolean;

  @Column({ type: "timestamptz", nullable: true })
  enabled_at!: Date | null;

  @Column({ type: "text", default: "[]" })
  backup_codes_encrypted!: string;

  @Column({ type: "timestamptz", nullable: true })
  last_used_at!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
