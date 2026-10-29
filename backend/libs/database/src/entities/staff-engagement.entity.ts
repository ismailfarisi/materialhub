import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { EngagementKind, EngagementStatus } from "../enums.ts";

// The capacity ledger — the single source of truth for "staff is busy" across
// ALL sources (marketplace, walk-in, phone, external import, block, break).
//
// NO soft delete: the row's lifecycle is driven by `status`. The GiST EXCLUDE
// constraint `no_double_book` (migration) enforces no overlap for rows whose
// status is in ('held','confirmed'); release/cancel move the row OUT of that
// predicate to free the range. `conflicted` sits outside the predicate too, so
// an iCal collision (Phase 6) is always insertable and surfaced, never dropped.
@Entity("staff_engagements")
// No `where` predicate on either: staff_engagements has NO soft delete (see
// above), so these mirror the migration's unfiltered indexes exactly.
@Index("idx_engagement_staff_start", ["staff_member_id", "starts_at"])
@Index("idx_engagement_vendor_start", ["vendor_id", "starts_at"])
export class StaffEngagement {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  staff_member_id!: string;

  @Column({ type: "uuid" })
  vendor_id!: string;

  @Column({ type: "timestamptz" })
  starts_at!: Date;

  @Column({ type: "timestamptz" })
  ends_at!: Date;

  // DERIVED — `GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED`.
  // READ ONLY: Postgres computes it and rejects any attempt to write it.
  //
  // This is load-bearing, not cosmetic. The `no_double_book` GiST EXCLUDE reads
  // ONLY slot_range, while the availability engine, the iCal feed and both
  // (staff|vendor, starts_at) indexes read ONLY starts_at/ends_at. When the
  // range was an independently writable column, any `save()`/`update()` that
  // changed the times without recomputing it would leave the EXCLUDE checking a
  // STALE range — double-booking protection silently off while the booking
  // displays the new time. Deriving it in the DB makes that unrepresentable.
  //
  // `generatedType: "STORED"` also makes TypeORM omit the column from every
  // INSERT/UPDATE it builds; the `readonly` modifier surfaces the same rule to
  // the type-checker. Read as the Postgres range literal.
  @Column({
    type: "tstzrange",
    generatedType: "STORED",
    asExpression: `tstzrange("starts_at", "ends_at", '[)')`,
  })
  readonly slot_range!: string;

  @Column({ type: "enum", enum: EngagementStatus, default: EngagementStatus.held })
  status!: EngagementStatus;

  @Column({ type: "enum", enum: EngagementKind })
  kind!: EngagementKind;

  @Column({ type: "varchar", length: 128, nullable: true })
  external_source!: string | null;

  // Idempotency key for iCal import (Phase 6): dedupe on the source event UID.
  @Column({ type: "varchar", length: 255, nullable: true })
  external_ref!: string | null;

  @Column({ type: "uuid", nullable: true })
  created_by!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;
}
