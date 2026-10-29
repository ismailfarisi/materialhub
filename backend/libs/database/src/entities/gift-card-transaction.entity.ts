import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { GiftCard } from "./gift-card.entity.ts";
import type { Order } from "./order.entity.ts";
import type { User } from "./user.entity.ts";

@Entity("gift_card_transactions")
export class GiftCardTransaction {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  gift_card_id!: string;

  @ManyToOne("GiftCard")
  @JoinColumn({ name: "gift_card_id" })
  giftCard!: GiftCard;

  @Column({ type: "uuid" })
  user_id!: string;

  @ManyToOne("User")
  @JoinColumn({ name: "user_id" })
  user!: User;

  @Column({ type: "uuid", nullable: true })
  order_id!: string | null;

  @ManyToOne("Order", { nullable: true })
  @JoinColumn({ name: "order_id" })
  order!: Order | null;

  @Column({ type: "integer" })
  amount!: number;

  @Column({ type: "integer" })
  balance_before!: number;

  @Column({ type: "integer" })
  balance_after!: number;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;
}
