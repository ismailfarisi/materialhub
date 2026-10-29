import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { LayoutStatus } from "../enums.ts";
import type { LayoutVersion } from "./layout-version.entity.ts";
import type { Vendor } from "./vendor.entity.ts";

@Entity("page_layouts")
export class PageLayout {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ type: "varchar", length: 255, unique: true }) slug!: string;
  @Column({ type: "uuid", nullable: true }) vendor_id!: string | null;
  @ManyToOne("Vendor", { nullable: true })
  @JoinColumn({ name: "vendor_id" })
  vendor!: Vendor | null;
  @Column({ type: "jsonb" }) title!: Record<string, string>;
  @Column({ type: "enum", enum: LayoutStatus, default: LayoutStatus.draft })
  status!: LayoutStatus;
  @Column({ type: "uuid", nullable: true }) published_version_id!: string | null;
  @ManyToOne("LayoutVersion", { nullable: true })
  @JoinColumn({ name: "published_version_id" })
  published_version!: LayoutVersion | null;
  @Column({ type: "uuid", nullable: true }) draft_version_id!: string | null;
  @ManyToOne("LayoutVersion", { nullable: true })
  @JoinColumn({ name: "draft_version_id" })
  draft_version!: LayoutVersion | null;
  @Column({ type: "uuid" }) created_by!: string;
  @OneToMany("LayoutVersion", "layout") versions!: LayoutVersion[];
  @CreateDateColumn({ type: "timestamptz" }) created_at!: Date;
  @UpdateDateColumn({ type: "timestamptz" }) updated_at!: Date;
  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
