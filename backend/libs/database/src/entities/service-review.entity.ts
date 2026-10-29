import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { ServiceReviewStatus } from "../enums.ts";

// A booking's post-service review — NOT the product-coupled `reviews` table
// (spec §4.3). One review per booking (1:1, enforced by the partial unique
// index below); Task 7 (reviews) builds the read/write endpoints on top of
// this scaffold. customer_user_id/vendor_id/staff_member_id/booking_id are
// kept as plain uuid columns (no ManyToOne) to keep the booking-service
// boundary loose, mirroring Booking's own cross-domain refs.
@Entity("service_reviews")
@Index("idx_service_reviews_vendor", ["vendor_id"], { where: "deleted_at IS NULL" })
@Index("idx_service_reviews_staff", ["staff_member_id"], { where: "deleted_at IS NULL" })
export class ServiceReview {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index({ unique: true, where: "deleted_at IS NULL" })
  @Column({ type: "uuid" })
  booking_id!: string;

  @Column({ type: "uuid" })
  customer_user_id!: string;

  @Column({ type: "uuid" })
  vendor_id!: string;

  @Column({ type: "uuid" })
  staff_member_id!: string;

  @Column({ type: "smallint" })
  rating!: number;

  @Column({ type: "varchar", length: 255, nullable: true })
  title!: string | null;

  @Column({ type: "text", nullable: true })
  body!: string | null;

  @Column({ type: "jsonb", default: [] })
  media_urls!: string[];

  @Column({ type: "enum", enum: ServiceReviewStatus, default: ServiceReviewStatus.pending })
  status!: ServiceReviewStatus;

  @Column({ type: "text", nullable: true })
  vendor_reply!: string | null;

  // Defaults true: a review only exists tied to a real booking_id (FK), so it
  // is verified-by-construction the same way product reviews'
  // is_verified_purchase defaults true off order_item_id.
  @Column({ type: "boolean", default: true })
  is_verified!: boolean;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
