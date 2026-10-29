import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { Product } from "./product.entity.ts";
import type { Reel } from "./reel.entity.ts";

@Entity("reel_product_tags")
export class ReelProductTag {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  reel_id!: string;

  @ManyToOne("Reel", (reel: Reel) => reel.tags, { onDelete: "CASCADE" })
  @JoinColumn({ name: "reel_id" })
  reel!: Reel;

  @Column({ type: "uuid" })
  product_id!: string;

  @ManyToOne("Product")
  @JoinColumn({ name: "product_id" })
  product!: Product;

  @Column({ type: "uuid", nullable: true })
  variant_id!: string | null;

  @Column({ type: "numeric", precision: 6, scale: 2 })
  timestamp_seconds!: string;

  @Column({ type: "numeric", precision: 5, scale: 4, nullable: true })
  display_x!: string | null;

  @Column({ type: "numeric", precision: 5, scale: 4, nullable: true })
  display_y!: string | null;

  @Column({ type: "int", default: 0 })
  tap_count!: number;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;
}
