import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("section_types")
export class SectionType {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ type: "varchar", length: 100, unique: true }) name!: string;
  @Column({ type: "jsonb" }) label!: Record<string, string>;
  @Column({ type: "text", nullable: true }) description!: string | null;
  @Column({ type: "varchar", length: 100, nullable: true }) icon!: string | null;
  @Column({ type: "jsonb", nullable: true }) settings_schema!: Record<string, unknown> | null;
  @Column({ type: "smallint", nullable: true }) max_per_layout!: number | null;
  @Column({ type: "boolean", default: true }) is_active!: boolean;
  @Column({ type: "varchar", length: 20, default: "platform" }) scope!:
    | "platform"
    | "vendor"
    | "both";
  @Column({ type: "boolean", default: false }) supports_bidding!: boolean;
  @Column({ type: "jsonb", nullable: true }) default_settings!: Record<string, unknown> | null;
  @CreateDateColumn({ type: "timestamptz" }) created_at!: Date;
  @UpdateDateColumn({ type: "timestamptz" }) updated_at!: Date;
}
