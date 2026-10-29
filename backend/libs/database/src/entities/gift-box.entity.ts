import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import type { GiftBoxItem } from "./gift-box-item.entity.ts";
import type { GiftBoxOccasion } from "./gift-box-occasion.entity.ts";
import type { GiftBoxStyle } from "./gift-box-style.entity.ts";

@Entity("gift_boxes")
export class GiftBox {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 200 })
  name!: string;

  @Index({ unique: true, where: "deleted_at IS NULL" })
  @Column({ type: "varchar", length: 200 })
  slug!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "uuid" })
  style_id!: string;

  @ManyToOne("GiftBoxStyle", { onDelete: "RESTRICT" })
  @JoinColumn({ name: "style_id" })
  style!: GiftBoxStyle;

  @Column({ type: "text", nullable: true })
  hero_image_url!: string | null;

  @Column({ type: "numeric", precision: 5, scale: 2, nullable: true })
  discount_percentage!: number | null;

  @Column({ type: "boolean", default: true })
  is_active!: boolean;

  @Column({ type: "timestamptz", nullable: true })
  starts_at!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  expires_at!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;

  @OneToMany("GiftBoxItem", "box")
  items!: GiftBoxItem[];

  @OneToMany("GiftBoxOccasion", "box")
  occasions!: GiftBoxOccasion[];
}
