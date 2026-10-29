import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import {
  BookingStatus,
  CancellationRefundPolicy,
  CommissionType,
  DepositType,
  ServicePaymentMode,
} from "../enums.ts";

// The rich booking row — 1:1 with a `staff_engagement` (kind=marketplace_booking),
// only for engagements that involve a MaterialHub customer/money (spec §4.3). Pure
// blocks (external_import, manual_block, break, and Phase 6 walk_in/phone without
// a MaterialHub customer) stay engagement-only.
//
// price/vat/deposit/policy fields are SNAPSHOTTED from `service_offering` at
// booking time so a later vendor policy edit can't change a customer's existing
// deal (spec §5.3). `commission_rate`/`commission_fils` are likewise snapshotted
// for accrual into the vendor_payout pipeline on completion (Phase 4 Task 9).
@Entity("bookings")
@Index("idx_bookings_vendor_starts", ["vendor_id", "starts_at"], { where: "deleted_at IS NULL" })
@Index("idx_bookings_staff_starts", ["staff_member_id", "starts_at"], {
  where: "deleted_at IS NULL",
})
export class Booking {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index("uq_bookings_number", { unique: true, where: "deleted_at IS NULL" })
  @Column({ type: "varchar", length: 30 })
  booking_number!: string;

  // Nullable since Phase 6 Task 1 (1782390000000) — a manual walk-in/phone
  // booking has no MaterialHub customer account. NULL <=> source !== 'marketplace'
  // in practice (every marketplace booking still requires a real customer).
  @Index("idx_bookings_customer", { where: "deleted_at IS NULL" })
  @Column({ type: "uuid", nullable: true })
  customer_user_id!: string | null;

  @Column({ type: "uuid" })
  vendor_id!: string;

  // Null for home-visit bookings (service rendered at customer_address instead).
  @Column({ type: "uuid", nullable: true })
  location_id!: string | null;

  // Required (validated in the service layer, not the DB) when location_id is
  // null i.e. location_mode = home_visit.
  @Column({ type: "jsonb", nullable: true })
  customer_address!: Record<string, unknown> | null;

  // Free-text customer capture for a walk-in/phone booking with no MaterialHub
  // account (Phase 6 Task 1, 1782390000000) — set only when customer_user_id
  // is null; unused (null) for marketplace bookings.
  @Column({ type: "varchar", length: 255, nullable: true })
  customer_name!: string | null;

  @Column({ type: "varchar", length: 32, nullable: true })
  customer_phone!: string | null;

  @Column({ type: "uuid" })
  staff_member_id!: string;

  // 1:1 with staff_engagements — the capacity-ledger row this booking occupies.
  @Index("uq_bookings_engagement", { unique: true, where: "deleted_at IS NULL" })
  @Column({ type: "uuid" })
  engagement_id!: string;

  // Nullable since Phase 6 Task 1 (1782390000000) — ManualBookingService can
  // create a booking row from customer details alone, before a service is
  // picked (e.g. a phone booking decided at the desk).
  @Column({ type: "uuid", nullable: true })
  service_offering_id!: string | null;

  // ── Snapshot: service + price/vat/deposit ──
  @Column({ type: "varchar", length: 255 })
  service_name!: string;

  @Column({ type: "integer" })
  duration_minutes!: number;

  @Column({ type: "integer" })
  price_fils!: number;

  @Column({ type: "integer", default: 0 })
  vat_fils!: number;

  @Column({ type: "integer", default: 0 })
  deposit_fils!: number;

  // ── Snapshot: cancellation/reschedule policy (drives the state machine, §5.3) ──
  @Column({ type: "enum", enum: DepositType, default: DepositType.none })
  deposit_type!: DepositType;

  @Column({ type: "integer" })
  cancellation_window_hours!: number;

  @Column({
    type: "enum",
    enum: CancellationRefundPolicy,
    default: CancellationRefundPolicy.full,
  })
  cancellation_refund_policy!: CancellationRefundPolicy;

  @Column({ type: "integer", default: 100 })
  cancellation_penalty_percent!: number;

  @Column({ type: "integer" })
  reschedule_window_hours!: number;

  // ── Snapshot: commission (accrued into vendor_payout on completed) ──
  @Column({ type: "numeric", precision: 8, scale: 4 })
  commission_rate!: number;

  @Column({ type: "integer", default: 0 })
  commission_fils!: number;

  // Which precedence branch produced commission_rate (vendor flat/tiered,
  // category, or global default all resolve to "percentage"; a literal
  // fixed-rate vendor resolves to "fixed", in which case commission_rate is a
  // raw fils CAP, not a percent). Snapshotted alongside rate/fils (review fix
  // — 1782300000000-CommissionBookingAccrual) so the accrued commission row
  // is labeled correctly instead of always defaulting to "percentage".
  // enumName pins the SHARED "commission_type" Postgres type the migration
  // actually uses (vendors.commission_type / commissions.commission_type use it
  // too). Without it TypeORM infers "bookings_commission_type_enum" and
  // migration:generate emits a spurious drift diff on every run.
  @Column({
    type: "enum",
    enum: CommissionType,
    enumName: "commission_type",
    default: CommissionType.percentage,
  })
  commission_type!: CommissionType;

  // ── Scheduling ──
  @Column({ type: "timestamptz" })
  starts_at!: Date;

  @Column({ type: "timestamptz" })
  ends_at!: Date;

  @Index("idx_bookings_status", { where: "deleted_at IS NULL" })
  @Column({ type: "enum", enum: BookingStatus, default: BookingStatus.pending_payment })
  status!: BookingStatus;

  // Free-text origin: 'marketplace' | 'walk_in' | 'phone' (Phase 6) — mirrors the
  // subset of EngagementKind values that carry a booking row. Not a Postgres enum
  // (spec §4.4 doesn't register one) so Phase 6 can extend it without a migration.
  @Column({ type: "varchar", length: 32, default: "marketplace" })
  source!: string;

  // ── Payment ──
  @Column({ type: "enum", enum: ServicePaymentMode })
  payment_mode!: ServicePaymentMode;

  @Column({ type: "integer", default: 0 })
  amount_paid_fils!: number;

  @Column({ type: "integer", default: 0 })
  balance_due_fils!: number;

  @Column({ type: "boolean", default: false })
  paid_at_venue!: boolean;

  // Refs into order-service (spec §4.3) — the shared `payments` table, which
  // carries a symmetric nullable `booking_id` back-reference. Kept as plain
  // uuid columns (no ManyToOne) to keep the booking-service/order-service
  // boundary loose, matching the rest of the Phase 1-3 booking entities.
  @Column({ type: "uuid", nullable: true })
  payment_id!: string | null;

  // Reserved for a future money-hold reference (e.g. a deposit/prepay
  // authorization record) into order-service; unused until Phase 4 Task 2+.
  @Column({ type: "uuid", nullable: true })
  escrow_hold_id!: string | null;

  @Column({ type: "text", nullable: true })
  notes!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
