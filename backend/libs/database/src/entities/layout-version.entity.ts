import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { LayoutSection } from "./layout-section.entity.ts";
import type { PageLayout } from "./page-layout.entity.ts";

@Entity("layout_versions")
export class LayoutVersion {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ type: "uuid" }) layout_id!: string;
  @ManyToOne("PageLayout", "versions") @JoinColumn({ name: "layout_id" }) layout!: PageLayout;
  @Column({ type: "integer" }) version_number!: number;
  @Column({ type: "timestamptz", nullable: true }) publish_at!: Date | null;
  @Column({ type: "timestamptz", nullable: true }) published_at!: Date | null;
  @Column({ type: "uuid" }) created_by!: string;
  @OneToMany("LayoutSection", "version") sections!: LayoutSection[];
  @CreateDateColumn({ type: "timestamptz" }) created_at!: Date;
}
