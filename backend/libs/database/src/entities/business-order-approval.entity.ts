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
import { OrderApprovalStatus } from "../enums.ts";
import type { BusinessAccount } from "./business-account.entity.ts";

export interface ApprovalItemSnapshot {
  product_id: string;
  variant_id: string | null;
  product_name: string;
  variant_name: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  quantity: number;
  unit_price_fils: number;
  line_total_fils: number;
}

/**
 * A buyer's request to place an order above the business approval limit.
 * It snapshots the cart; an approval is valid only for a cart with the same
 * hash (same items, quantities and prices) and is consumed by one order.
 */
@Entity("business_order_approvals")
export class BusinessOrderApproval {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "uuid" })
  business_account_id!: string;

  @ManyToOne("BusinessAccount")
  @JoinColumn({ name: "business_account_id" })
  businessAccount!: BusinessAccount;

  @Index()
  @Column({ type: "uuid" })
  requested_by!: string;

  @Column({ type: "varchar", length: 128 })
  cart_hash!: string;

  @Column({ type: "integer" })
  amount_fils!: number;

  @Column({ type: "char", length: 3, default: "AED" })
  currency!: string;

  @Column({ type: "jsonb" })
  items_snapshot!: ApprovalItemSnapshot[];

  @Column({ type: "text", nullable: true })
  note!: string | null;

  @Index()
  @Column({
    type: "enum",
    enum: OrderApprovalStatus,
    enumName: "business_order_approval_status_enum",
    default: OrderApprovalStatus.pending,
  })
  status!: OrderApprovalStatus;

  @Column({ type: "uuid", nullable: true })
  decided_by!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  decided_at!: Date | null;

  @Column({ type: "text", nullable: true })
  decision_note!: string | null;

  /** Set on approval: decided_at + 72h. */
  @Column({ type: "timestamptz", nullable: true })
  expires_at!: Date | null;

  @Column({ type: "uuid", nullable: true, unique: true })
  order_id!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;
}
