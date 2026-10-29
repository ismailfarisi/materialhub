import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export interface GiftBoxDimensions {
  length: number;
  width: number;
  height: number;
  unit: "cm" | "mm" | "in";
}

@Entity("gift_box_styles")
export class GiftBoxStyle {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 150 })
  name!: string;

  @Index({ unique: true, where: "deleted_at IS NULL" })
  @Column({ type: "varchar", length: 150 })
  slug!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "jsonb", nullable: true })
  dimensions!: GiftBoxDimensions | null;

  @Column({ type: "integer", default: 1 })
  max_capacity!: number;

  @Column({ type: "integer", default: 0 })
  base_price!: number;

  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  images!: string[];

  @Column({ type: "boolean", default: true })
  is_active!: boolean;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
