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
import type { AttributeValue } from "./attribute-value.entity.ts";

@Entity("attribute_value_translations")
@Unique(["attribute_value_id", "locale"])
export class AttributeValueTranslation {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  attribute_value_id!: string;

  @ManyToOne("AttributeValue", { onDelete: "CASCADE" })
  @JoinColumn({ name: "attribute_value_id" })
  attribute_value!: AttributeValue;

  @Column({ type: "varchar", length: 10 })
  locale!: string;

  @Column({ type: "varchar", length: 100 })
  value!: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  display_value!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
