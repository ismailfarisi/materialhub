import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { ReelBriefEventType } from "../enums.ts";
import type { ReelBrief } from "./reel-brief.entity.ts";

/** Append-only audit of brief/bid lifecycle transitions (mirrors reel_license_offer_events). */
@Entity("reel_brief_events")
export class ReelBriefEvent {
  @PrimaryGeneratedColumn("uuid") id!: string;

  @Column({ type: "uuid" }) brief_id!: string;
  @ManyToOne("ReelBrief", { onDelete: "CASCADE" })
  @JoinColumn({ name: "brief_id" })
  brief?: ReelBrief;

  @Column({ type: "uuid", nullable: true }) bid_id!: string | null;
  @Column({ type: "varchar", length: 10 }) actor!: string;
  @Column({ type: "enum", enum: ReelBriefEventType }) event_type!: ReelBriefEventType;
  @Column({ type: "bigint", nullable: true }) amount_fils_snapshot!: string | null;
  @Column({ type: "text", nullable: true }) note!: string | null;

  @CreateDateColumn({ type: "timestamptz" }) created_at!: Date;
}
