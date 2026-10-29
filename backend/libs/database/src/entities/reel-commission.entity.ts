import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { ReelCommissionStatus } from "../enums.ts";
import type { OrderItem } from "./order-item.entity.ts";
import type { Order } from "./order.entity.ts";
import type { Product } from "./product.entity.ts";
import type { Reel } from "./reel.entity.ts";
import type { User } from "./user.entity.ts";
import type { Vendor } from "./vendor.entity.ts";
import type { WalletTransaction } from "./wallet-transaction.entity.ts";

@Entity("reel_commissions")
export class ReelCommission {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  creator_id!: string;

  @ManyToOne("User")
  @JoinColumn({ name: "creator_id" })
  creator?: User;

  @Column({ type: "uuid" })
  reel_id!: string;

  @ManyToOne("Reel")
  @JoinColumn({ name: "reel_id" })
  reel?: Reel;

  // No @ManyToOne — parent reel_attributions is range-partitioned, no FK exists.
  @Column({ type: "uuid" })
  attribution_id!: string;

  @Column({ type: "uuid" })
  order_id!: string;

  @ManyToOne("Order")
  @JoinColumn({ name: "order_id" })
  order?: Order;

  @Column({ type: "uuid" })
  order_item_id!: string;

  @ManyToOne("OrderItem")
  @JoinColumn({ name: "order_item_id" })
  order_item?: OrderItem;

  @Column({ type: "uuid" })
  vendor_id!: string;

  @ManyToOne("Vendor")
  @JoinColumn({ name: "vendor_id" })
  vendor?: Vendor;

  @Column({ type: "uuid" })
  product_id!: string;

  @ManyToOne("Product")
  @JoinColumn({ name: "product_id" })
  product?: Product;

  @Column({ type: "bigint" })
  item_price_fils!: string;

  @Column({ type: "numeric", precision: 5, scale: 4 })
  commission_rate_snapshot!: string;

  @Column({ type: "numeric", precision: 5, scale: 4 })
  subsidy_share_snapshot!: string;

  @Column({ type: "bigint" })
  gross_commission_fils!: string;

  @Column({ type: "bigint" })
  vendor_share_fils!: string;

  @Column({ type: "bigint" })
  platform_subsidy_fils!: string;

  @Column({
    type: "enum",
    enum: ReelCommissionStatus,
    default: ReelCommissionStatus.pending,
  })
  status!: ReelCommissionStatus;

  @Column({ type: "timestamptz", nullable: true })
  eligible_at?: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  earned_at?: Date | null;

  @Column({ type: "uuid", nullable: true })
  wallet_transaction_id?: string | null;

  @ManyToOne("WalletTransaction", { nullable: true })
  @JoinColumn({ name: "wallet_transaction_id" })
  wallet_transaction?: WalletTransaction | null;

  @Column({ type: "text", nullable: true })
  voided_reason?: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;
}
