import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import type { Product } from "./product.entity.ts";
import type { Reel } from "./reel.entity.ts";
import type { User } from "./user.entity.ts";

@Entity("reel_attributions")
export class ReelAttribution {
  @PrimaryColumn({ type: "uuid", default: () => "gen_random_uuid()" })
  id!: string;

  @Column({ type: "uuid", nullable: true })
  user_id!: string | null;

  @ManyToOne("User", { nullable: true })
  @JoinColumn({ name: "user_id" })
  user?: User | null;

  @Column({ type: "uuid", nullable: true })
  session_id!: string | null;

  @Column({ type: "uuid" })
  reel_id!: string;

  @ManyToOne("Reel")
  @JoinColumn({ name: "reel_id" })
  reel?: Reel;

  @Column({ type: "uuid" })
  product_id!: string;

  @ManyToOne("Product")
  @JoinColumn({ name: "product_id" })
  product?: Product;

  @Column({ type: "uuid" })
  creator_id!: string;

  @PrimaryColumn({ type: "timestamptz", default: () => "now()" })
  tapped_at!: Date;

  @Column({ type: "timestamptz" })
  expires_at!: Date;

  @Column({ type: "int" })
  attribution_window_days_snapshot!: number;

  @Column({ type: "uuid", nullable: true })
  consumed_order_item_id?: string | null;
}
