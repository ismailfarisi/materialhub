import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import type { GiftBox } from "./gift-box.entity.ts";

@Entity("gift_box_items")
@Index("uq_gift_box_items_variant", ["gift_box_id", "product_id", "variant_id"], {
  unique: true,
  where: "deleted_at IS NULL AND variant_id IS NOT NULL",
})
@Index("uq_gift_box_items_novariant", ["gift_box_id", "product_id"], {
  unique: true,
  where: "deleted_at IS NULL AND variant_id IS NULL",
})
export class GiftBoxItem {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  gift_box_id!: string;

  @ManyToOne("GiftBox", { onDelete: "CASCADE" })
  @JoinColumn({ name: "gift_box_id" })
  box!: GiftBox;

  @Column({ type: "uuid" })
  product_id!: string;

  @Column({ type: "uuid", nullable: true })
  variant_id!: string | null;

  @Column({ type: "integer", default: 1 })
  quantity!: number;

  @Column({ type: "smallint", default: 0 })
  sort_order!: number;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
