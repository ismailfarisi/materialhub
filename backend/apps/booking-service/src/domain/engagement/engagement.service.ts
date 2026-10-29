import { type EngagementKind, EngagementStatus, type StaffEngagement } from "@materialhub/database";
import { ConflictError, NotFoundError } from "@materialhub/plugins";
import type { Repository } from "typeorm";
import type { AvailabilityCache } from "../availability/availability-cache.ts";

export interface ReserveEngagementInput {
  staffMemberId: string;
  vendorId: string;
  startsAt: Date | string;
  endsAt: Date | string;
  kind: EngagementKind;
  status?: EngagementStatus;
  externalSource?: string | null;
  externalRef?: string | null;
  createdBy?: string | null;
}

// The write primitive over the capacity ledger. Every source of "staff is busy"
// (marketplace booking, walk-in, phone, external import, block) goes through
// reserve(); the Postgres GiST EXCLUDE constraint `no_double_book` guarantees no
// overlap for held/confirmed rows. release()/cancel() move a row out of the
// EXCLUDE predicate to free the range. Phases 4 (bookings) and 6 (manual/iCal)
// build on this.
export class EngagementService {
  // cache is optional so existing unit tests (and any caller that doesn't need
  // read-model freshness) construct the service without it.
  constructor(
    private readonly repo: Repository<StaffEngagement>,
    private readonly cache?: AvailabilityCache,
  ) {}

  async reserve(input: ReserveEngagementInput): Promise<StaffEngagement> {
    const status = input.status ?? EngagementStatus.held;
    const rows = await this.runExclusionGuarded(() =>
      this.repo.manager.query(
        // `slot_range` is GENERATED ALWAYS AS (tstzrange(starts_at, ends_at,
        // '[)')) STORED — Postgres derives it and rejects any explicit write,
        // so it is deliberately absent from this column list.
        `INSERT INTO staff_engagements
           (staff_member_id, vendor_id, starts_at, ends_at, status, kind,
            external_source, external_ref, created_by)
         VALUES ($1, $2, $3::timestamptz, $4::timestamptz,
            $5::staff_engagements_status_enum, $6::staff_engagements_kind_enum, $7, $8, $9)
         RETURNING *`,
        [
          input.staffMemberId,
          input.vendorId,
          input.startsAt,
          input.endsAt,
          status,
          input.kind,
          input.externalSource ?? null,
          input.externalRef ?? null,
          input.createdBy ?? null,
        ],
      ),
    );
    const row = rows[0] as StaffEngagement;
    await this.invalidate(row);
    return row;
  }

  // Move an existing engagement to a new time range (and, optionally, a new
  // staff member) — Phase 5 Task 3 (reschedule). Rescheduling a booking is a
  // single UPDATE of its capacity-ledger row's `slot_range`/`starts_at`/
  // `ends_at` (+ `staff_member_id`), so the SAME GiST EXCLUDE `no_double_book`
  // constraint that guards reserve() re-checks the new range against every
  // OTHER held/confirmed engagement — a `23P01` therefore surfaces as the
  // exact same 409 ConflictError (via the shared runExclusionGuarded helper,
  // NOT a duplicated translation). Caller is expected to run this inside a
  // transaction alongside the matching `bookings` row update so both commit
  // (or roll back on a 409) together. Invalidates the availability cache for
  // BOTH the OLD staff/day (freed) and the NEW staff/day (claimed) — the old
  // range is read before the UPDATE, the new one from the returned row — since
  // a staff or day change means two different cache keys are now stale.
  async move(input: {
    engagementId: string;
    staffMemberId: string;
    startsAt: Date | string;
    endsAt: Date | string;
  }): Promise<StaffEngagement> {
    const before = await this.repo.findOne({ where: { id: input.engagementId } });
    if (!before) throw new NotFoundError("Engagement not found");

    const rows = await this.runExclusionGuarded(() =>
      this.repo.manager.query(
        // No `deleted_at` predicate — staff_engagements is NOT soft-deleted
        // (no DeleteDateColumn on the entity), matching reserve()'s INSERT.
        // `slot_range` is a STORED generated column derived from
        // starts_at/ends_at, so Postgres recomputes it here automatically and
        // rejects an explicit SET — that is precisely what makes a stale range
        // (and thus a silently-disabled EXCLUDE) unrepresentable.
        `UPDATE staff_engagements
           SET staff_member_id = $2,
               starts_at = $3::timestamptz,
               ends_at = $4::timestamptz
         WHERE id = $1
         RETURNING *`,
        [input.engagementId, input.staffMemberId, input.startsAt, input.endsAt],
      ),
    );
    const row = rows[0] as StaffEngagement | undefined;
    if (!row) throw new NotFoundError("Engagement not found");

    // Invalidate the OLD staff/day (now freed) from `before`, and the NEW
    // staff/day (now claimed) from the caller's known-good input Dates — NOT
    // from the raw RETURNING row, whose timestamptz fields the pg driver
    // hands back in a form `new Date(...)` can choke on inside invalidateRange.
    await this.invalidate(before);
    if (this.cache) {
      await this.cache.invalidateRange(
        input.staffMemberId,
        new Date(input.startsAt),
        new Date(input.endsAt),
      );
    }
    return row;
  }

  // Shared 23P01 (exclusion_violation) -> 409 translation for every write that
  // can collide on the `no_double_book` GiST EXCLUDE constraint (reserve INSERT,
  // move UPDATE). Kept as one helper so the mapping lives in exactly one place.
  private async runExclusionGuarded<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      // 23P01 = exclusion_violation — the slot overlaps an existing
      // held/confirmed engagement for this staff member.
      if ((err as { code?: string })?.code === "23P01") {
        throw new ConflictError("Slot unavailable — staff member is already engaged");
      }
      throw err;
    }
  }

  // Marks a held engagement confirmed — the capacity-ledger side of a booking
  // transitioning pending_payment → confirmed (spec §5.3). Phase 4 Task 5 uses
  // this directly for the pay_at_venue immediate-confirm path; Task 6's state
  // machine calls it for the deposit/prepay webhook-confirm path too, so this
  // is the shared primitive both build on rather than each writing its own
  // engagement status update.
  confirm(engagementId: string): Promise<void> {
    return this.setStatus(engagementId, EngagementStatus.confirmed);
  }

  release(engagementId: string): Promise<void> {
    return this.setStatus(engagementId, EngagementStatus.released);
  }

  cancel(engagementId: string): Promise<void> {
    return this.setStatus(engagementId, EngagementStatus.cancelled);
  }

  private async setStatus(id: string, status: EngagementStatus): Promise<void> {
    // Load first so we know the staff/day to invalidate; releasing/cancelling
    // frees the range, so the cached day must be recomputed.
    const engagement = await this.repo.findOne({ where: { id } });
    if (!engagement) throw new NotFoundError("Engagement not found");
    await this.repo.update({ id }, { status });
    await this.invalidate(engagement);
  }

  private async invalidate(engagement: StaffEngagement): Promise<void> {
    if (!this.cache) return;
    await this.cache.invalidateRange(
      engagement.staff_member_id,
      new Date(engagement.starts_at),
      new Date(engagement.ends_at),
    );
  }
}
