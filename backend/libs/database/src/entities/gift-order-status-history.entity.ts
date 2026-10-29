import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { GiftOrder } from "./gift-order.entity.ts";

@Entity("gift_order_status_history")
export class GiftOrderStatusHistory {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "uuid" })
  gift_order_id!: string;

  @ManyToOne("GiftOrder", { onDelete: "CASCADE" })
  @JoinColumn({ name: "gift_order_id" })
  giftOrder!: GiftOrder;

  @Column({ type: "varchar", length: 50, nullable: true })
  from_status!: string | null;

  @Column({ type: "varchar", length: 50 })
  to_status!: string;

  @Column({ type: "uuid", nullable: true })
  changed_by!: string | null;

  @Column({ type: "text", nullable: true })
  note!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;
}
