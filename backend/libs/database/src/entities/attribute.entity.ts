import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { AttributeFilterInputType, AttributeType } from "../enums.ts";
import type { AttributeValue } from "./attribute-value.entity.ts";

@Entity("attributes")
export class Attribute {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 100 })
  name!: string;

  @Index({ unique: true, where: "deleted_at IS NULL" })
  @Column({ type: "varchar", length: 100, unique: true })
  slug!: string;

  @Column({ type: "enum", enum: AttributeType })
  type!: AttributeType;

  @Column({ type: "boolean", default: true })
  is_filterable!: boolean;

  @Column({ type: "boolean", default: false })
  is_searchable!: boolean;

  @Column({ type: "boolean", default: false })
  is_required!: boolean;

  @Column({ type: "boolean", default: false })
  is_variant!: boolean;

  @Column({ type: "boolean", default: false })
  is_groupable!: boolean;

  @Column({
    type: "enum",
    enum: AttributeFilterInputType,
    enumName: "attributes_filter_input_type_enum",
    nullable: true,
  })
  filter_input_type!: AttributeFilterInputType | null;

  @Column({ type: "smallint", default: 0 })
  sort_order!: number;

  @Column({ type: "jsonb", nullable: true })
  validation!: Record<string, unknown> | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;

  @OneToMany("AttributeValue", "attribute")
  values!: AttributeValue[];
}
