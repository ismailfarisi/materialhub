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
import { GiftCardStatus } from "../enums.ts";
import type { Order } from "./order.entity.ts";
import type { User } from "./user.entity.ts";

@Entity("gift_cards")
export class GiftCard {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index({ unique: true, where: "deleted_at IS NULL" })
  @Column({ type: "varchar", length: 50, unique: true })
  code!: string;

  @Column({ type: "integer" })
  initial_balance!: number;

  @Column({ type: "integer" })
  current_balance!: number;

  @Column({ type: "char", length: 3, default: "AED" })
  currency!: string;

  @Column({ type: "enum", enum: GiftCardStatus, default: GiftCardStatus.active })
  status!: GiftCardStatus;

  @Column({ type: "uuid", nullable: true })
  purchased_by!: string | null;

  @ManyToOne("User", { nullable: true })
  @JoinColumn({ name: "purchased_by" })
  purchasedByUser!: User | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  recipient_email!: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  recipient_name!: string | null;

  @Column({ type: "text", nullable: true })
  personal_message!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  expires_at!: Date | null;

  @Column({ type: "uuid", nullable: true })
  purchase_order_id!: string | null;

  @ManyToOne("Order", { nullable: true })
  @JoinColumn({ name: "purchase_order_id" })
  purchaseOrder!: Order | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
