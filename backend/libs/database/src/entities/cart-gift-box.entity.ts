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
import type { Cart } from "./cart.entity.ts";

export interface CartGiftBoxComponent {
  product_id: string;
  variant_id: string | null;
  vendor_id: string;
  unit_price: number; // fils
  quantity: number;
}

@Entity("cart_gift_boxes")
export class CartGiftBox {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "uuid" })
  cart_id!: string;

  @ManyToOne("Cart", { onDelete: "CASCADE" })
  @JoinColumn({ name: "cart_id" })
  cart!: Cart;

  @Column({ type: "uuid" })
  gift_box_id!: string;

  @Column({ type: "integer", default: 1 })
  quantity!: number;

  // Computed box total per unit, in fils (items - discount + packaging).
  @Column({ type: "integer" })
  unit_price!: number;

  @Column({ type: "integer", default: 0 })
  packaging_price!: number;

  @Column({ type: "integer", default: 0 })
  discount_total!: number;

  @Column({ type: "varchar", length: 200 })
  box_name_snapshot!: string;

  @Column({ type: "jsonb", nullable: true })
  style_snapshot!: Record<string, unknown> | null;

  @Column({ type: "jsonb", nullable: true })
  occasion_snapshot!: Record<string, unknown> | null;

  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  components!: CartGiftBoxComponent[];

  @Column({ type: "text", nullable: true })
  gift_message!: string | null;

  @Column({ type: "varchar", length: 200, nullable: true })
  recipient_name!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
