import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import {
  CancellationRefundPolicy,
  DepositType,
  ServiceLocationMode,
  ServiceOfferingStatus,
  ServicePaymentMode,
} from "../enums.ts";
import type { ServiceOfferingTranslation } from "./service-offering-translation.entity.ts";

@Entity("service_offerings")
export class ServiceOffering {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index("idx_service_offerings_vendor", { where: "deleted_at IS NULL" })
  @Column({ type: "uuid" })
  vendor_id!: string;

  @Column({ type: "uuid", nullable: true })
  category_id!: string | null;

  @Index("uq_service_offerings_slug", { unique: true, where: "deleted_at IS NULL" })
  @Column({ type: "varchar", length: 255 })
  slug!: string;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "jsonb", default: [] })
  media_urls!: string[];

  @Column({ type: "integer" })
  duration_minutes!: number;

  @Column({ type: "integer", default: 0 })
  buffer_before_minutes!: number;

  @Column({ type: "integer", default: 0 })
  buffer_after_minutes!: number;

  @Column({ type: "integer", default: 15 })
  slot_step_minutes!: number;

  @Column({
    type: "enum",
    enum: ServiceLocationMode,
    default: ServiceLocationMode.at_premises,
  })
  location_mode!: ServiceLocationMode;

  @Column({
    type: "enum",
    enum: ServicePaymentMode,
    default: ServicePaymentMode.pay_at_venue,
  })
  payment_mode!: ServicePaymentMode;

  @Column({ type: "integer" })
  price_fils!: number;

  @Column({ type: "enum", enum: DepositType, default: DepositType.none })
  deposit_type!: DepositType;

  // percent stored as integer 0..100 when deposit_type is percent; fils when fixed
  @Column({ type: "integer", default: 0 })
  deposit_value!: number;

  @Column({ type: "numeric", precision: 5, scale: 2, default: 5 })
  vat_rate!: number;

  @Column({ type: "integer", default: 0 })
  min_notice_minutes!: number;

  @Column({ type: "integer", default: 60 })
  max_advance_days!: number;

  @Column({ type: "integer", default: 24 })
  cancellation_window_hours!: number;

  @Column({
    type: "enum",
    enum: CancellationRefundPolicy,
    default: CancellationRefundPolicy.full,
  })
  cancellation_refund_policy!: CancellationRefundPolicy;

  @Column({ type: "integer", default: 100 })
  cancellation_penalty_percent!: number;

  @Column({ type: "integer", default: 24 })
  reschedule_window_hours!: number;

  @Column({
    type: "enum",
    enum: ServiceOfferingStatus,
    default: ServiceOfferingStatus.draft,
  })
  status!: ServiceOfferingStatus;

  // Set when an admin rejects a pending_review offering; cleared on resubmit.
  @Column({ type: "text", nullable: true })
  rejection_reason!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  reviewed_at!: Date | null;

  @Column({ type: "uuid", nullable: true })
  reviewed_by!: string | null;

  @Column({ type: "boolean", default: true })
  auto_approve!: boolean;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;

  @OneToMany("ServiceOfferingTranslation", "offering")
  translations!: ServiceOfferingTranslation[];
}
