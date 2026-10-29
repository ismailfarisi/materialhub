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
import type { Product } from "./product.entity.ts";

// One live stock row per (product, variant, warehouse). The actual DB index
// (see 1782200000000-DedupeInventoryAddUniqueIndex) is additionally declared
// NULLS NOT DISTINCT so simple products (variant_id NULL) can't duplicate — the
// decorator can't express that, but synchronize is off so it never diverges.
@Index(
  "uq_inventory_product_variant_warehouse_active",
  ["product_id", "variant_id", "warehouse_id"],
  {
    unique: true,
    where: "deleted_at IS NULL",
  },
)
@Entity("inventory")
export class Inventory {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  product_id!: string;

  @ManyToOne("Product")
  @JoinColumn({ name: "product_id" })
  product!: Product;

  @Column({ type: "uuid", nullable: true })
  variant_id!: string | null;

  @Column({ type: "uuid" })
  vendor_id!: string;

  @Column({ type: "uuid", nullable: true })
  warehouse_id!: string | null;

  @Column({ type: "integer", default: 0 })
  quantity_on_hand!: number;

  @Column({ type: "integer", default: 0 })
  quantity_reserved!: number;

  @Column({ type: "integer", default: 0 })
  quantity_available!: number;

  @Column({ type: "integer", default: 5 })
  low_stock_threshold!: number;

  @Column({ type: "integer", nullable: true })
  reorder_point!: number | null;

  @Column({ type: "integer", nullable: true })
  max_stock_level!: number | null;

  @Column({ type: "timestamptz", nullable: true })
  last_restocked_at!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
