import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { Order } from "./order.entity.ts";
import type { User } from "./user.entity.ts";

@Entity("wallet_transactions")
export class WalletTransaction {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  user_id!: string;

  @ManyToOne("User")
  @JoinColumn({ name: "user_id" })
  user!: User;

  @Column({ type: "integer" })
  amount!: number;

  @Column({ type: "char", length: 3, default: "AED" })
  currency!: string;

  @Column({ type: "integer" })
  balance_before!: number;

  @Column({ type: "integer" })
  balance_after!: number;

  @Column({ type: "varchar", length: 50 })
  transaction_type!: string;

  @Column({ type: "uuid", nullable: true })
  order_id!: string | null;

  @ManyToOne("Order", { nullable: true })
  @JoinColumn({ name: "order_id" })
  order!: Order | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  reference_type!: string | null;

  @Column({ type: "uuid", nullable: true })
  reference_id!: string | null;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  expires_at!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;
}
