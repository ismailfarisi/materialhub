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

@Entity("site_settings")
export class SiteSetting {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index({ unique: true, where: "deleted_at IS NULL" })
  @Column({ type: "varchar", length: 255, unique: true })
  key!: string;

  @Column({ type: "text" })
  value!: string;

  @Column({ type: "varchar", length: 20 })
  value_type!: string;

  @Column({ type: "varchar", length: 100, nullable: true, name: "setting_group" })
  group!: string | null;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "uuid", nullable: true })
  updated_by!: string | null;

  @ManyToOne("User", { nullable: true })
  @JoinColumn({ name: "updated_by" })
  updatedByUser!: User | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
