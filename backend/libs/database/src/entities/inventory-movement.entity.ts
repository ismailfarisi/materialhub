import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { Inventory } from "./inventory.entity.ts";
import type { ProductVariant } from "./product-variant.entity.ts";
import type { Product } from "./product.entity.ts";
import type { User } from "./user.entity.ts";

@Entity("inventory_movements")
export class InventoryMovement {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  inventory_id!: string;

  @ManyToOne("Inventory")
  @JoinColumn({ name: "inventory_id" })
  inventory!: Inventory;

  @Column({ type: "uuid" })
  product_id!: string;

  @ManyToOne("Product")
  @JoinColumn({ name: "product_id" })
  product!: Product;

  @Column({ type: "uuid", nullable: true })
  variant_id!: string | null;

  @ManyToOne("ProductVariant", { nullable: true })
  @JoinColumn({ name: "variant_id" })
  variant!: ProductVariant | null;

  @Column({ type: "integer" })
  quantity!: number;

  @Column({ type: "integer" })
  quantity_before!: number;

  @Column({ type: "integer" })
  quantity_after!: number;

  @Column({ type: "varchar", length: 50 })
  movement_type!: string;

  @Column({ type: "varchar", length: 50, nullable: true })
  reference_type!: string | null;

  @Column({ type: "uuid", nullable: true })
  reference_id!: string | null;

  @Column({ type: "text", nullable: true })
  notes!: string | null;

  @Column({ type: "uuid", nullable: true })
  created_by!: string | null;

  @ManyToOne("User", { nullable: true })
  @JoinColumn({ name: "created_by" })
  createdByUser!: User | null;

  @Column({ type: "varchar", length: 128, nullable: true })
  external_change_id!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;
}
