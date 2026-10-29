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
import type { ProductBundle } from "./product-bundle.entity.ts";

@Entity("bundle_items")
@Unique(["bundle_id", "product_id", "variant_id"])
export class BundleItem {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  bundle_id!: string;

  @ManyToOne("ProductBundle", { onDelete: "CASCADE" })
  @JoinColumn({ name: "bundle_id" })
  bundle!: ProductBundle;

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
