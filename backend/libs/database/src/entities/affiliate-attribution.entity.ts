import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { Product } from "./product.entity.ts";
import type { User } from "./user.entity.ts";
import type { VendorAffiliate } from "./vendor-affiliate.entity.ts";

// NOTE: reel_attributions is range-partitioned; we deliberately do NOT
// partition here. Affiliate click volume is orders of magnitude lower and a
// plain table keeps FKs, migrations, and the unique idempotency index simple.
@Entity("affiliate_attributions")
export class AffiliateAttribution {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "uuid" })
  vendor_affiliate_id!: string;

  @ManyToOne("VendorAffiliate")
  @JoinColumn({ name: "vendor_affiliate_id" })
  vendor_affiliate!: VendorAffiliate;

  @Column({ type: "uuid" })
  vendor_id!: string;

  @Column({ type: "uuid", nullable: true })
  user_id!: string | null;

  @ManyToOne("User", { nullable: true })
  @JoinColumn({ name: "user_id" })
  user?: User | null;

  @Column({ type: "uuid", nullable: true })
  session_id!: string | null;

  // null = store-wide link (attributes any item from this vendor).
  @Column({ type: "uuid", nullable: true })
  product_id!: string | null;

  @ManyToOne("Product", { nullable: true })
  @JoinColumn({ name: "product_id" })
  product?: Product | null;

  @Column({ type: "uuid", nullable: true })
  affiliate_link_id!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  clicked_at!: Date;

  @Column({ type: "timestamptz" })
  expires_at!: Date;

  @Column({ type: "int" })
  attribution_window_days_snapshot!: number;

  @Column({ type: "uuid", nullable: true })
  consumed_order_item_id!: string | null;
}
