import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import type { SectionType } from "./section-type.entity.ts";

@Entity("section_bid_slots")
export class SectionBidSlot {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ type: "uuid" }) section_type_id!: string;
  @ManyToOne("SectionType") @JoinColumn({ name: "section_type_id" }) section_type!: SectionType;
  @Column({ type: "smallint" }) max_slots!: number;
  @Column({ type: "integer" }) min_bid_fils!: number;
  @Column({ type: "varchar", length: 20, default: "per_day" }) billing_model!: string;
  @CreateDateColumn({ type: "timestamptz" }) created_at!: Date;
  @UpdateDateColumn({ type: "timestamptz" }) updated_at!: Date;
}
