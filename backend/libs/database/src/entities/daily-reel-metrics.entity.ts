import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

@Entity("daily_reel_metrics")
export class DailyReelMetrics {
  @PrimaryColumn({ type: "uuid" })
  reel_id!: string;

  @PrimaryColumn({ type: "date" })
  bucket_date!: string; // YYYY-MM-DD

  @Column({ type: "int", default: 0 })
  impressions!: number;

  @Column({ type: "int", default: 0 })
  unique_viewers!: number;

  @Column({ type: "int", default: 0 })
  likes!: number;

  @Column({ type: "int", default: 0 })
  saves!: number;

  @Column({ type: "int", default: 0 })
  shares!: number;

  @Column({ type: "int", default: 0 })
  product_taps!: number;

  @Column({ type: "int", default: 0 })
  attributed_orders!: number;

  @Column({ type: "bigint", default: 0 })
  attributed_gmv_fils!: string;

  @Column({ type: "bigint", default: 0 })
  earned_commission_fils!: string;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;
}
