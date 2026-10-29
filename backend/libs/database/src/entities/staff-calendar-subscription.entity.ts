import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

// A vendor's external calendar (Google / Fresha / etc., exposed as an iCal
// URL) subscribed against ONE staff member — Phase 6 Task 4 (inbound iCal
// import). The `ical-import.job.ts` poller fetches `ical_url` every 15 min and
// funnels each VEVENT into the SAME `staff_engagements` capacity ledger (as
// `kind=external_import` rows keyed on `external_source=<this row's id>` +
// `external_ref=<event uid>`), so an external booking blocks MaterialHub
// availability like any other engagement.
//
// Soft-deleted (DeleteDateColumn): removing a subscription releases all its
// imported engagements immediately (CalendarSubscriptionService.remove) — the
// soft-delete keeps history/audit while the partial unique index below lets a
// staff member re-register a fresh subscription afterwards.
//
// `vendor_id` is denormalized (derivable via staff_member_id -> staff_members)
// to scope the poller/notification lookups without a join, consistent with
// `staff_engagements` carrying its own `vendor_id`. `last_sync_error` is
// ops-visibility only: set on a failed fetch/oversize/non-200, cleared on the
// next successful sync.
@Entity("staff_calendar_subscriptions")
@Index(["staff_member_id"], { unique: true, where: "deleted_at IS NULL" })
export class StaffCalendarSubscription {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  staff_member_id!: string;

  @Column({ type: "uuid" })
  vendor_id!: string;

  // The external calendar's iCal feed URL (http/https). Not encrypted — a
  // secret-bearing token is part of the URL as the vendor's calendar provider
  // issued it (same posture as any webhook URL we store).
  @Column({ type: "text" })
  ical_url!: string;

  @Column({ type: "timestamptz", nullable: true })
  last_synced_at!: Date | null;

  // Last fetch/sync failure reason (non-200, oversize, network/timeout).
  // Cleared to null on the next successful sync.
  @Column({ type: "varchar", length: 500, nullable: true })
  last_sync_error!: string | null;

  @Column({ type: "boolean", default: true })
  is_active!: boolean;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
