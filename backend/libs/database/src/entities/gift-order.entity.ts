import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { GiftFulfillmentStatus } from "../enums.ts";
import type { Order } from "./order.entity.ts";

@Entity("gift_orders")
export class GiftOrder {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "uuid" })
  order_id!: string;

  @ManyToOne("Order", { onDelete: "CASCADE" })
  @JoinColumn({ name: "order_id" })
  order!: Order;

  @Column({ type: "uuid", nullable: true })
  gift_box_id!: string | null;

  @Column({ type: "varchar", length: 200 })
  box_name_snapshot!: string;

  @Column({ type: "jsonb", nullable: true })
  box_style_snapshot!: Record<string, unknown> | null;

  @Column({ type: "jsonb", nullable: true })
  occasion_snapshot!: Record<string, unknown> | null;

  @Column({ type: "integer", default: 0 })
  packaging_price_snapshot!: number;

  @Column({ type: "text", nullable: true })
  gift_message!: string | null;

  @Column({ type: "varchar", length: 200, nullable: true })
  recipient_name!: string | null;

  @Column({
    type: "enum",
    enum: GiftFulfillmentStatus,
    enumName: "gift_orders_fulfillment_status_enum",
    default: GiftFulfillmentStatus.awaiting_items,
  })
  fulfillment_status!: GiftFulfillmentStatus;

  @Column({ type: "uuid", nullable: true })
  hub_warehouse_id!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  assembled_at!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  dispatched_at!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  delivered_at!: Date | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  outbound_carrier!: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  outbound_tracking_number!: string | null;

  @Column({ type: "varchar", length: 1024, nullable: true })
  outbound_tracking_url!: string | null;

  @Column({ type: "text", nullable: true })
  assembly_notes!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;
}
