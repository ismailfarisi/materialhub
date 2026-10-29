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
import type { Product } from "./product.entity.ts";

@Entity("product_translations")
@Unique(["product_id", "locale"])
export class ProductTranslation {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  product_id!: string;

  @ManyToOne("Product", { onDelete: "CASCADE" })
  @JoinColumn({ name: "product_id" })
  product!: Product;

  @Column({ type: "varchar", length: 10 })
  locale!: string;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Column({ type: "text", nullable: true })
  short_description!: string | null;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "jsonb", nullable: true })
  rich_description!: Record<string, unknown> | null;

  @Column({ type: "text", nullable: true })
  ingredients!: string | null;

  @Column({ type: "text", nullable: true })
  usage_instructions!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  meta_title!: string | null;

  @Column({ type: "varchar", length: 500, nullable: true })
  meta_description!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
