import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { ChannelReviewStatus, ChannelSyncStatus } from "../enums/channel.enums.ts";

@Entity("channel_listings")
@Index("channel_listings_offer_variant_uq", ["channel_id", "product_id", "variant_id"], {
  unique: true,
  where: "deleted_at IS NULL AND variant_id IS NOT NULL",
})
@Index("channel_listings_offer_base_uq", ["channel_id", "product_id"], {
  unique: true,
  where: "deleted_at IS NULL AND variant_id IS NULL",
})
@Index("channel_listings_review_idx", ["channel_id", "review_status"])
export class ChannelListing {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  channel_id!: string;

  @Column({ type: "uuid" })
  product_id!: string;

  @Column({ type: "uuid", nullable: true })
  variant_id!: string | null;

  @Column({ type: "varchar", length: 128 })
  offer_id!: string;

  @Column({ type: "enum", enum: ChannelSyncStatus, default: ChannelSyncStatus.pending })
  sync_status!: ChannelSyncStatus;

  @Column({ type: "enum", enum: ChannelReviewStatus, default: ChannelReviewStatus.pending })
  review_status!: ChannelReviewStatus;

  @Column({ type: "jsonb", nullable: true })
  disapproval_reasons!: Record<string, unknown>[] | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  content_hash!: string | null;

  @Column({ type: "boolean", default: false })
  excluded!: boolean;

  @Column({ type: "varchar", length: 255, nullable: true })
  exclusion_reason!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  last_synced_at!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
