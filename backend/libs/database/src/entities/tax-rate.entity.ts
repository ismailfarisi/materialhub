import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import type { Category } from "./category.entity.ts";

@Entity("tax_rates")
export class TaxRate {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Column({ type: "numeric", precision: 5, scale: 2 })
  rate!: number;

  @Column({ type: "char", length: 2, default: "AE" })
  country_code!: string;

  @Column({ type: "varchar", length: 50, nullable: true })
  emirate!: string | null;

  @Column({ type: "uuid", nullable: true })
  category_id!: string | null;

  @ManyToOne("Category", { nullable: true })
  @JoinColumn({ name: "category_id" })
  category!: Category | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  zone_type!: string | null;

  @Column({ type: "boolean", default: false })
  is_default!: boolean;

  @Column({ type: "date" })
  effective_from!: string;

  @Column({ type: "date", nullable: true })
  effective_until!: string | null;

  @Column({ type: "boolean", default: true })
  is_active!: boolean;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
