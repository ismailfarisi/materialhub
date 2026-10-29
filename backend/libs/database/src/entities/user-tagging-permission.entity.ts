import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { ReelTaggingScope } from "../enums.ts";
import type { User } from "./user.entity.ts";

@Entity("user_tagging_permissions")
export class UserTaggingPermission {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  user_id!: string;

  @ManyToOne("User")
  @JoinColumn({ name: "user_id" })
  user!: User;

  @Column({ type: "enum", enum: ReelTaggingScope })
  scope!: ReelTaggingScope;

  @Column({ type: "uuid", nullable: true })
  brand_id!: string | null;

  @Column({ type: "uuid", nullable: true })
  vendor_id!: string | null;

  @Column({ type: "uuid", array: true, nullable: true })
  product_ids!: string[] | null;

  @Column({ type: "uuid" })
  granted_by!: string;

  @CreateDateColumn({ type: "timestamptz", name: "granted_at" })
  granted_at!: Date;

  @Column({ type: "timestamptz", nullable: true })
  expires_at!: Date | null;

  @Column({ type: "text", nullable: true })
  reason!: string | null;
}
