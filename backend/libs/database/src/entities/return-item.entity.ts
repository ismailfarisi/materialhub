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
import { ReturnReason } from "../enums.ts";
import type { OrderItem } from "./order-item.entity.ts";
import type { Return } from "./return.entity.ts";

@Entity("return_items")
export class ReturnItem {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  return_id!: string;

  @ManyToOne("Return")
  @JoinColumn({ name: "return_id" })
  return_!: Return;

  @Column({ type: "uuid" })
  order_item_id!: string;

  @ManyToOne("OrderItem")
  @JoinColumn({ name: "order_item_id" })
  orderItem!: OrderItem;

  @Column({ type: "integer" })
  quantity!: number;

  @Column({ type: "enum", enum: ReturnReason })
  reason!: ReturnReason;

  @Column({ type: "varchar", length: 50, nullable: true })
  condition!: string | null;

  @Column({ type: "integer", nullable: true })
  refund_amount!: number | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
