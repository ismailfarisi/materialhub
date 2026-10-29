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
import { ReservationStatus } from "../enums.ts";
import type { Cart } from "./cart.entity.ts";
import type { Inventory } from "./inventory.entity.ts";
import type { Order } from "./order.entity.ts";

@Entity("inventory_reservations")
export class InventoryReservation {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  inventory_id!: string;

  @ManyToOne("Inventory")
  @JoinColumn({ name: "inventory_id" })
  inventory!: Inventory;

  @Column({ type: "uuid", nullable: true })
  order_id!: string | null;

  @ManyToOne("Order", { nullable: true })
  @JoinColumn({ name: "order_id" })
  order!: Order | null;

  @Column({ type: "uuid", nullable: true })
  cart_id!: string | null;

  @ManyToOne("Cart", { nullable: true })
  @JoinColumn({ name: "cart_id" })
  cart!: Cart | null;

  @Column({ type: "integer" })
  quantity!: number;

  @Column({
    type: "enum",
    enum: ReservationStatus,
    default: ReservationStatus.active,
  })
  status!: ReservationStatus;

  @Column({ type: "timestamptz", default: () => "NOW()" })
  reserved_at!: Date;

  @Column({ type: "timestamptz" })
  expires_at!: Date;

  @Column({ type: "timestamptz", nullable: true })
  committed_at!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  released_at!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
