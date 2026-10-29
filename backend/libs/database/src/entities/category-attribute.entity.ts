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
import type { Category } from "./category.entity.ts";

@Entity("category_attributes")
@Unique(["category_id", "attribute_id"])
export class CategoryAttribute {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  category_id!: string;

  @ManyToOne("Category", { onDelete: "CASCADE" })
  @JoinColumn({ name: "category_id" })
  category!: Category;

  @Column({ type: "uuid" })
  attribute_id!: string;

  @ManyToOne("Attribute", { onDelete: "CASCADE" })
  @JoinColumn({ name: "attribute_id" })
  attribute!: Attribute;

  @Column({ type: "boolean", default: false })
  is_required!: boolean;

  @Column({ type: "smallint", default: 0 })
  sort_order!: number;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
