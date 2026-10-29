import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { VendorMemberRole } from "../enums.ts";
import type { User } from "./user.entity.ts";

@Entity("role_permissions")
@Unique(["role", "permission"])
export class RolePermission {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "enum", enum: VendorMemberRole })
  role!: VendorMemberRole;

  @Column({ type: "varchar", length: 64 })
  permission!: string;

  @Column({ type: "uuid", nullable: true })
  updated_by_user_id!: string | null;

  @ManyToOne("User", { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "updated_by_user_id" })
  updated_by!: User | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;
}
