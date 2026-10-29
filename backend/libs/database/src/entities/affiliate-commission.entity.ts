import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { AffiliateCommissionStatus, AffiliateCommissionType } from "../enums.ts";
import type { OrderItem } from "./order-item.entity.ts";
import type { Order } from "./order.entity.ts";
import type { Product } from "./product.entity.ts";
import type { VendorAffiliate } from "./vendor-affiliate.entity.ts";
import type { VendorOrder } from "./vendor-order.entity.ts";
import type { Vendor } from "./vendor.entity.ts";
import type { WalletTransaction } from "./wallet-transaction.entity.ts";

@Entity("affiliate_commissions")
export class AffiliateCommission {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  vendor_affiliate_id!: string;

  @ManyToOne("VendorAffiliate")
  @JoinColumn({ name: "vendor_affiliate_id" })
  vendor_affiliate?: VendorAffiliate;

  @Column({ type: "uuid" })
  vendor_id!: string;

  @ManyToOne("Vendor")
  @JoinColumn({ name: "vendor_id" })
  vendor?: Vendor;

  // No @ManyToOne — parent affiliate_attributions carries no FK guarantee.
  @Column({ type: "uuid" })
  attribution_id!: string;

  @Column({ type: "uuid" })
  order_id!: string;

  @ManyToOne("Order")
  @JoinColumn({ name: "order_id" })
  order?: Order;

  @Column({ type: "uuid" })
  vendor_order_id!: string;

  @ManyToOne("VendorOrder")
  @JoinColumn({ name: "vendor_order_id" })
  vendor_order?: VendorOrder;

  @Column({ type: "uuid" })
  order_item_id!: string;

  @ManyToOne("OrderItem")
  @JoinColumn({ name: "order_item_id" })
  order_item?: OrderItem;

  @Column({ type: "uuid" })
  product_id!: string;

  @ManyToOne("Product")
  @JoinColumn({ name: "product_id" })
  product?: Product;

  // Gross item price the commission is computed on (line_total, fils).
  @Column({ type: "bigint" })
  gross_fils!: string;

  @Column({ type: "enum", enum: AffiliateCommissionType })
  commission_type_snapshot!: AffiliateCommissionType;

  // bps (percentage) or fils (fixed), snapshotted from the affiliate at order time.
  @Column({ type: "integer" })
  commission_value_snapshot!: number;

  @Column({ type: "bigint" })
  commission_fils!: string;

  @Column({
    type: "enum",
    enum: AffiliateCommissionStatus,
    default: AffiliateCommissionStatus.pending,
  })
  status!: AffiliateCommissionStatus;

  @Column({ type: "timestamptz", nullable: true })
  eligible_at!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  earned_at!: Date | null;

  @Column({ type: "uuid", nullable: true })
  wallet_transaction_id!: string | null;

  @ManyToOne("WalletTransaction", { nullable: true })
  @JoinColumn({ name: "wallet_transaction_id" })
  wallet_transaction?: WalletTransaction | null;

  @Column({ type: "text", nullable: true })
  reversed_reason!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;
}
