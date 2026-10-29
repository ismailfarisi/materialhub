import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

@Entity("daily_creator_metrics")
export class DailyCreatorMetrics {
  @PrimaryColumn({ type: "uuid" })
  creator_id!: string;

  @PrimaryColumn({ type: "date" })
  bucket_date!: string;

  @Column({ type: "int", default: 0 })
  reel_count!: number;

  @Column({ type: "int", default: 0 })
  impressions!: number;

  @Column({ type: "int", default: 0 })
  unique_viewers!: number;

  @Column({ type: "int", default: 0 })
  engagement_events!: number;

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
