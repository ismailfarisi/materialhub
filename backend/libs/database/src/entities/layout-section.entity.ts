import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { SourceMode } from "../enums.ts";
import type { LayoutVersion } from "./layout-version.entity.ts";
import type { SectionType } from "./section-type.entity.ts";

@Entity("layout_sections")
export class LayoutSection {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ type: "uuid" }) version_id!: string;
  @ManyToOne("LayoutVersion", "sections", { onDelete: "CASCADE" })
  @JoinColumn({ name: "version_id" })
  version!: LayoutVersion;
  @Column({ type: "uuid" }) section_type_id!: string;
  @ManyToOne("SectionType") @JoinColumn({ name: "section_type_id" }) section_type!: SectionType;
  @Column({ type: "smallint" }) position!: number;
  @Column({ type: "boolean", default: true }) enabled!: boolean;
  @Column({ type: "jsonb", default: { mobile: true, web: true } }) visibility!: {
    mobile: boolean;
    web: boolean;
  };
  @Column({ type: "jsonb", nullable: true }) targeting!: Record<string, unknown> | null;
  @Column({ type: "jsonb", default: {} }) settings!: Record<string, unknown>;
  @Column({ type: "enum", enum: SourceMode, default: SourceMode.manual }) source_mode!: SourceMode;
  @Column({ type: "jsonb", nullable: true }) data_source!: Record<string, unknown> | null;
  @Column({ type: "jsonb", nullable: true }) blocks!: Record<string, unknown>[] | null;
  @Column({ type: "jsonb", nullable: true }) bid_config!: Record<string, unknown> | null;
  @CreateDateColumn({ type: "timestamptz" }) created_at!: Date;
  @UpdateDateColumn({ type: "timestamptz" }) updated_at!: Date;
}
