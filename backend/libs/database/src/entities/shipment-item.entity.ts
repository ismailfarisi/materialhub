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
import type { OrderItem } from "./order-item.entity.ts";
import type { Shipment } from "./shipment.entity.ts";

@Entity("shipment_items")
@Unique(["shipment_id", "order_item_id"])
export class ShipmentItem {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  shipment_id!: string;

  @ManyToOne("Shipment", "items")
  @JoinColumn({ name: "shipment_id" })
  shipment!: Shipment;

  @Column({ type: "uuid" })
  order_item_id!: string;

  @ManyToOne("OrderItem")
  @JoinColumn({ name: "order_item_id" })
  orderItem!: OrderItem;

  @Column({ type: "integer" })
  quantity!: number;

  @Column({ type: "boolean", default: false })
  is_delivered!: boolean;

  @Column({ type: "timestamptz", nullable: true })
  delivered_at!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
