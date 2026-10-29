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
import type { Brand } from "./brand.entity.ts";

@Entity("brand_translations")
@Unique(["brand_id", "locale"])
export class BrandTranslation {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  brand_id!: string;

  @ManyToOne("Brand", { onDelete: "CASCADE" })
  @JoinColumn({ name: "brand_id" })
  brand!: Brand;

  @Column({ type: "varchar", length: 10 })
  locale!: string;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
