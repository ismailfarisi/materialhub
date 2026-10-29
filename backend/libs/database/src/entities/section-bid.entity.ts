import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { BidStatus } from "../enums.ts";
import type { LayoutSection } from "./layout-section.entity.ts";

@Entity("section_bids")
export class SectionBid {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ type: "uuid" }) section_id!: string;
  @ManyToOne("LayoutSection") @JoinColumn({ name: "section_id" }) section!: LayoutSection;
  @Column({ type: "uuid" }) vendor_id!: string;
  @Column({ type: "integer" }) bid_amount_fils!: number;
  @Column({ type: "enum", enum: BidStatus, default: BidStatus.pending }) status!: BidStatus;
  @Column({ type: "uuid", nullable: true }) product_id!: string | null;
  @Column({ type: "jsonb", nullable: true }) content!: Record<string, unknown> | null;
  @Column({ type: "timestamptz" }) starts_at!: Date;
  @Column({ type: "timestamptz" }) expires_at!: Date;
  @Column({ type: "varchar", length: 50, nullable: true }) cancellation_reason!: string | null;
  @CreateDateColumn({ type: "timestamptz" }) created_at!: Date;
  @UpdateDateColumn({ type: "timestamptz" }) updated_at!: Date;
}
