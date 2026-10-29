// block-time.service.ts
//
// Phase 6 Task 2 (spec off-platform capacity). A vendor location manager
// blocks a staff member's time (`manual_block` — e.g. "closed for
// stocktake") or logs a `break` directly against the SAME `staff_engagement`
// capacity ledger every other engagement source (marketplace booking,
// walk-in/phone, external import) writes to.
//
// ── Binding design decision (mirrors Task 1's manual-booking.service.ts) ───
// ENGAGEMENT-ONLY. Unlike a walk-in/phone booking (which sometimes writes a
// `bookings` row so the vendor calendar shows a customer name), a block has
// no customer and nothing to show beyond "staff is busy" — a `bookings` row
// would be dead weight here, so this service NEVER writes one.
//
// ── `reason` storage decision ───────────────────────────────────────────
// `staff_engagements` has no notes/reason column (see the entity) and this
// task is scoped to NOT add a migration for one. The optional `reason` is
// piggybacked onto the ledger's existing free-text `external_source` column
// instead. Only manual_block/break rows use it this way; Phase 6 Task 6's
// iCal import will also populate `external_source` (on `external_import`-
// kind rows, identifying the feed) — the two never collide in practice
// because they're gated by different `kind` values, but Task 6's db-design
// write-up should call out that the column is now dual-purposed (block
// reason vs. import feed identifier) rather than treat it as single-purpose.
//
// ── Authorization decision (create vs. list/delete) ─────────────────────
// `create` takes a `vendor_location_id` directly, so the location-scoped
// `assertLocationManager` check runs in BlockTimeController.create (mirrors
// ManualBookingController.create — Task 1's own precedent) BEFORE this
// service is ever called; this service then only re-checks that the staff
// member belongs to the active vendor and is linked to that location
// (mirrors ManualBookingService.create's own staff/link checks).
//
// `list`/`delete` take no location id (staff_engagements has no location
// column), so this service derives it: `list()` resolves the actor's
// managing location(s) via `getManagedLocationIds` (or the single queried
// `vendor_location_id` via `assertLocationManager` directly, when supplied)
// and restricts the result set through the same `staff_locations` join it
// already uses for the `vendorLocationId` filter; `delete()` resolves the
// target engagement's `staff_member_id` -> linked `vendor_location_id`s and
// runs `isLocationManagerOfAll` against them. Owner/vendor-manager roles keep
// their unrestricted fast path (identical behavior to before this fix) —
// only a non-owner/manager actor is location-checked at all.
//
// This isn't defense against a hypothetical: the seeded `role_permissions`
// matrix only grants `products.write` to `owner`/`manager` today, but
// `PUT /admin/role-permissions/:role` (vendor-service,
// role-permissions-admin.routes.ts) lets a super_admin grant it to a
// location-scoped role (e.g. `staff`) via a single authenticated live call —
// no deploy, picked up by every process within the matrix cache's ~30s TTL.
// Without this check, that grant would let a location-scoped actor list and
// release ANY block/break at ANY of the vendor's locations, not just the
// branch they were delegated. The vendor_id scoping stays in place
// regardless (this is a same-vendor, cross-location gap, never
// cross-vendor).
import {
  EngagementKind,
  EngagementStatus,
  type StaffEngagement,
  type StaffLocation,
  type StaffMember,
} from "@materialhub/database";
import { BadRequestError, NotFoundError } from "@materialhub/plugins";
import type { Repository } from "typeorm";
import {
  type LocationScopeRepos,
  assertLocationManager,
  getManagedLocationIds,
  isLocationManagerOfAll,
  isVendorManagerRole,
} from "../../guards/location-scope.ts";
import type { AvailabilityCache } from "../availability/availability-cache.ts";
import { EngagementService } from "../engagement/engagement.service.ts";

export interface BlockTimeActor {
  userId: string;
  vendorId: string;
  role: string;
}

export interface CreateBlockInput {
  staffMemberId: string;
  vendorLocationId: string;
  startsAt: Date | string;
  endsAt: Date | string;
  // manual_block | break only — validated by the DTO's literal union; typed
  // as the narrower EngagementKind here since that's what
  // EngagementService.reserve expects.
  kind: EngagementKind;
  reason?: string | null;
}

export interface ListBlocksQuery {
  staffMemberId?: string;
  vendorLocationId?: string;
  from: Date | string;
  to: Date | string;
}

// The two kinds this surface is allowed to create/list/delete. Any other
// engagement kind (marketplace_booking, walk_in, phone, external_import) is
// out of scope for this route — delete() 404s rather than releasing one.
const BLOCK_KINDS = new Set<EngagementKind>([EngagementKind.manual_block, EngagementKind.break]);

// ── Span bounds (review finding 6) ──────────────────────────────────────────
// `startsAt < endsAt` alone is not a bound. `POST /manage/blocks` with
// {starts_at:"2020-01-01", ends_at:"2400-01-01"} inserted ONE confirmed
// engagement whose slot_range covered the `no_double_book` GiST predicate for
// centuries — after which every customer booking for that staff member 409s,
// from a single unprivileged-ish call. The read side already caps its query
// range at 62 days; these mirror that intent for the write side.
export const MAX_BLOCK_DAYS = 62;
// How far back a block may be dated. Some backfill ("we were shut yesterday")
// is legitimate; arbitrary history is not, and a block in the distant past
// blocks nothing useful anyway.
export const MAX_BLOCK_PAST_DAYS = 30;
// Upper bound on how far ahead a block may start — keeps a single call from
// reserving a slot decades out.
export const MAX_BLOCK_FUTURE_DAYS = 730;
const DAY_MS = 86_400_000;

// Shared span/date validation for the two capacity-writing manage surfaces.
// Exported so manual-booking.service.ts applies the IDENTICAL rule (both write
// to the same ledger through the same exclusion constraint).
export function assertSaneEngagementSpan(
  startsAt: Date,
  endsAt: Date,
  now: Date = new Date(),
  maxDays: number = MAX_BLOCK_DAYS,
): void {
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    throw new BadRequestError("startsAt and endsAt must be valid dates");
  }
  if (!(startsAt.getTime() < endsAt.getTime())) {
    throw new BadRequestError("startsAt must be before endsAt");
  }
  if (endsAt.getTime() - startsAt.getTime() > maxDays * DAY_MS) {
    throw new BadRequestError(`span must not exceed ${maxDays} days`);
  }
  if (startsAt.getTime() < now.getTime() - MAX_BLOCK_PAST_DAYS * DAY_MS) {
    throw new BadRequestError(
      `startsAt must not be more than ${MAX_BLOCK_PAST_DAYS} days in the past`,
    );
  }
  if (startsAt.getTime() > now.getTime() + MAX_BLOCK_FUTURE_DAYS * DAY_MS) {
    throw new BadRequestError(
      `startsAt must not be more than ${MAX_BLOCK_FUTURE_DAYS} days in the future`,
    );
  }
}

export class BlockTimeService {
  constructor(
    private readonly staffRepo: Repository<StaffMember>,
    private readonly staffLocationRepo: Repository<StaffLocation>,
    private readonly engagementRepo: Repository<StaffEngagement>,
    private readonly locationScope: LocationScopeRepos,
    private readonly cache?: AvailabilityCache,
  ) {}

  async create(
    actor: BlockTimeActor,
    input: CreateBlockInput,
    now: Date = new Date(),
  ): Promise<StaffEngagement> {
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    assertSaneEngagementSpan(startsAt, endsAt, now);

    const staff = await this.staffRepo.findOne({
      where: { id: input.staffMemberId, vendor_id: actor.vendorId },
    });
    if (!staff) throw new NotFoundError("Staff member not found");

    const link = await this.staffLocationRepo.findOne({
      where: { staff_member_id: staff.id, vendor_location_id: input.vendorLocationId },
    });
    if (!link) {
      throw new BadRequestError("Staff member is not linked to this location");
    }

    const engagementService = new EngagementService(this.engagementRepo, this.cache);
    // Overlap -> EngagementService.reserve's own 23P01 -> ConflictError (409)
    // mapping propagates unchanged.
    return engagementService.reserve({
      staffMemberId: staff.id,
      vendorId: actor.vendorId,
      startsAt,
      endsAt,
      kind: input.kind,
      status: EngagementStatus.confirmed,
      externalSource: input.reason ?? null,
      createdBy: actor.userId,
    });
  }

  async list(actor: BlockTimeActor, query: ListBlocksQuery): Promise<StaffEngagement[]> {
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestError("from and to must be valid dates");
    }

    // Resolve the location-manager check BEFORE touching the engagement
    // table at all — fail fast (403/404, or an empty result for "no managed
    // locations") without ever building/running the query.
    let locationFilter: { vendorLocationId: string } | { managedLocationIds: string[] } | null =
      null;
    if (query.vendorLocationId) {
      // A single explicit location filter -> the same location-manager check
      // create() runs, so a location-scoped actor can't list another
      // branch's blocks just by knowing its id (403/404 like create(), not a
      // silent empty result).
      await assertLocationManager(actor, query.vendorLocationId, this.locationScope);
      locationFilter = { vendorLocationId: query.vendorLocationId };
    } else {
      // No explicit location filter -> restrict to the actor's own delegated
      // location(s), unless they're an owner/vendor-manager (unrestricted
      // fast path, `null`). This is what closes the cross-location gap: a
      // location-scoped actor granted `products.write` (see header comment)
      // can no longer list every branch's blocks, only the location(s) they
      // hold a managing location_membership for.
      const managedLocationIds = await getManagedLocationIds(actor, this.locationScope);
      if (managedLocationIds !== null) {
        if (managedLocationIds.length === 0) return [];
        locationFilter = { managedLocationIds };
      }
    }

    const qb = this.engagementRepo
      .createQueryBuilder("e")
      .where("e.vendor_id = :vendorId", { vendorId: actor.vendorId })
      .andWhere("e.kind IN (:...kinds)", { kinds: [...BLOCK_KINDS] })
      .andWhere("e.status = :status", { status: EngagementStatus.confirmed })
      .andWhere("e.starts_at < :to AND e.ends_at > :from", { from, to });

    if (query.staffMemberId) {
      qb.andWhere("e.staff_member_id = :staffMemberId", { staffMemberId: query.staffMemberId });
    }

    // staff_engagements carries no location column — scope through the
    // staff member's linked (non-soft-deleted) locations instead.
    //
    // ── KNOWN LIMITATION, not a clean scope (review finding 5) ───────────────
    // This predicate is satisfied by a staff member linked to ANY of the
    // scoped branches, so a staff member linked to both A and B has their B
    // blocks listed in an A-scoped request. Unlike the booking rows on
    // ManageCalendarService.list — which were leaking customer_name/notes/
    // price_fils cross-branch and are now scoped on the booking's OWN
    // `location_id`, matching manage-booking-actions.controller.ts — this
    // route is kind-gated to manual_block/break, which have NO booking row and
    // NO location anywhere in the schema, so there is nothing to scope on. The
    // exposure is limited to the existence/timing of a colleague's block at a
    // sibling branch of the SAME vendor (no customer data, and cross-vendor
    // remains impossible via the `e.vendor_id` filter above).
    // Closing it properly needs a `vendor_location_id` column on
    // staff_engagements, populated by create() (which already receives one)
    // and backfilled — a migration, deliberately out of scope for this
    // security-fix pass. Do not read this note as "the leak on the calendar
    // read was acceptable"; that one was real and is fixed.
    if (locationFilter && "vendorLocationId" in locationFilter) {
      qb.andWhere(
        `e.staff_member_id IN (
          SELECT sl.staff_member_id FROM staff_locations sl
          WHERE sl.vendor_location_id = :vendorLocationId AND sl.deleted_at IS NULL
        )`,
        { vendorLocationId: locationFilter.vendorLocationId },
      );
    } else if (locationFilter) {
      qb.andWhere(
        `e.staff_member_id IN (
          SELECT sl.staff_member_id FROM staff_locations sl
          WHERE sl.vendor_location_id IN (:...managedLocationIds) AND sl.deleted_at IS NULL
        )`,
        { managedLocationIds: locationFilter.managedLocationIds },
      );
    }

    return qb.orderBy("e.starts_at", "ASC").getMany();
  }

  async delete(actor: BlockTimeActor, id: string): Promise<void> {
    // vendor_id-scoped lookup: a different vendor's block (or a nonexistent
    // id) 404s rather than leaking existence. A same-vendor engagement whose
    // kind isn't manual_block/break (e.g. a marketplace booking's
    // engagement) also 404s here — this route must never be able to release
    // a non-block engagement.
    const engagement = await this.engagementRepo.findOne({
      where: { id, vendor_id: actor.vendorId },
    });
    if (!engagement || !BLOCK_KINDS.has(engagement.kind)) {
      throw new NotFoundError("Block not found");
    }

    // Location-manager check equivalent to create()'s: owner/vendor-manager
    // keep the unchanged, unrestricted fast path; any other actor must hold
    // a managing location_membership for at least one location this
    // engagement's staff member is linked to. 404 (not 403) on failure — the
    // same "don't leak existence" contract as the kind/vendor checks above,
    // now extended to "don't leak whether a block exists at a location this
    // actor doesn't manage".
    if (!isVendorManagerRole(actor.role)) {
      const links = await this.staffLocationRepo.find({
        where: { staff_member_id: engagement.staff_member_id },
      });
      const authorized = await isLocationManagerOfAll(
        actor,
        links.map((link) => link.vendor_location_id),
        this.locationScope,
      );
      if (!authorized) {
        throw new NotFoundError("Block not found");
      }
    }

    const engagementService = new EngagementService(this.engagementRepo, this.cache);
    await engagementService.release(id);
  }
}
