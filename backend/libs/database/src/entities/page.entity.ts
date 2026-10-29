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
import { PageStatus } from "../enums.ts";
import type { User } from "./user.entity.ts";

@Entity("pages")
export class Page {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 255 })
  title!: string;

  @Index({ unique: true, where: "deleted_at IS NULL" })
  @Column({ type: "varchar", length: 255, unique: true })
  slug!: string;

  @Column({ type: "text", nullable: true })
  content!: string | null;

  @Column({ type: "jsonb", nullable: true })
  rich_content!: Record<string, unknown> | null;

  @Column({ type: "enum", enum: PageStatus, default: PageStatus.draft })
  status!: PageStatus;

  @Column({ type: "timestamptz", nullable: true })
  published_at!: Date | null;

  @Column({ type: "uuid", nullable: true })
  author_id!: string | null;

  @ManyToOne("User", { nullable: true })
  @JoinColumn({ name: "author_id" })
  author!: User | null;

  @Column({ type: "varchar", length: 10, default: "en" })
  locale!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  meta_title!: string | null;

  @Column({ type: "varchar", length: 500, nullable: true })
  meta_description!: string | null;

  @Column({ type: "integer", default: 0 })
  sort_order!: number;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
