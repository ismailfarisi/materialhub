import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { GiftBox } from "./gift-box.entity.ts";
import type { GiftOccasion } from "./gift-occasion.entity.ts";

@Entity("gift_box_occasions")
@Index(["gift_box_id", "occasion_id"], { unique: true })
export class GiftBoxOccasion {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  gift_box_id!: string;

  @ManyToOne("GiftBox", { onDelete: "CASCADE" })
  @JoinColumn({ name: "gift_box_id" })
  box!: GiftBox;

  @Column({ type: "uuid" })
  occasion_id!: string;

  @ManyToOne("GiftOccasion", { onDelete: "CASCADE" })
  @JoinColumn({ name: "occasion_id" })
  occasion!: GiftOccasion;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;
}
