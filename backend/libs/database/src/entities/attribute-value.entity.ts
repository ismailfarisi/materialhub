import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import type { Attribute } from "./attribute.entity.ts";

@Entity("attribute_values")
@Unique(["attribute_id", "slug"])
export class AttributeValue {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  attribute_id!: string;

  @ManyToOne("Attribute", { onDelete: "CASCADE" })
  @JoinColumn({ name: "attribute_id" })
  attribute!: Attribute;

  @Column({ type: "varchar", length: 100 })
  value!: string;

  @Column({ type: "varchar", length: 100 })
  slug!: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  display_value!: string | null;

  @Column({ type: "char", length: 7, nullable: true })
  color_hex!: string | null;

  @Column({ type: "varchar", length: 1024, nullable: true })
  swatch_image_url!: string | null;

  @Column({ type: "smallint", default: 0 })
  sort_order!: number;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
