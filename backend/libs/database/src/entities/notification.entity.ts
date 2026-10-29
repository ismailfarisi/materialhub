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
import { NotificationChannel, NotificationType } from "../enums.ts";
import type { User } from "./user.entity.ts";

@Entity("notifications")
export class Notification {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  user_id!: string;

  @ManyToOne("User", "notifications", { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: User;

  @Column({ type: "enum", enum: NotificationType })
  type!: NotificationType;

  @Column({
    type: "enum",
    enum: NotificationChannel,
    default: NotificationChannel.in_app,
  })
  channel!: NotificationChannel;

  @Column({ type: "varchar", length: 255 })
  title!: string;

  @Column({ type: "text" })
  body!: string;

  @Column({ type: "jsonb", nullable: true })
  data!: Record<string, unknown> | null;

  @Column({ type: "boolean", default: false })
  is_read!: boolean;

  @Column({ type: "timestamptz", nullable: true })
  read_at!: Date | null;

  @Column({ type: "varchar", length: 1024, nullable: true })
  action_url!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
