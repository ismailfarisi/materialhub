// manage-calendar.service.ts
//
// Task 0A (Phase 7 backend prerequisite) — GET /manage/calendar. A unified,
// vendor/location-scoped read across ALL staff_engagements kinds
// (marketplace_booking, walk_in, phone, external_import, manual_block,
// break) for the dashboard day/week calendar view. Distinct from
// block-time.service.ts's `list()`, which only returns manual_block/break
// kind rows — this is the "everything" read that surface never provided
// (see phase7-recon-api.md gotcha #6).
//
// ── Range validation (binding decision) ─────────────────────────────────────
// Mirrors AvailabilityController.getBySlug's own required/parseable/
// ordering/62-day-cap validation, including its error class
// (UnprocessableEntityError) — the brief calls this out explicitly ("mirror
// availability's cap + error class"), which is why this validation lives
// here rather than reusing block-time.controller.ts's simpler
// BadRequestError-on-missing-only check.
//
// ── Location scoping (binding decision) ─────────────────────────────────────
// Copied verbatim from BlockTimeService.list's own resolution: an explicit
// `vendor_location_id` asserts the actor manages that branch
// (assertLocationManager — 403/404, never a silent empty result); no filter +
// a non-owner/manager actor auto-restricts to the actor's own managed
// location(s) via getManagedLocationIds (empty managed set -> `[]`, never a
// cross-branch/cross-vendor leak); owner/manager stays unrestricted. See
// block-time.service.ts's header comment for the full rationale (the
// role_permissions matrix can grant `products.write` to a location-scoped
// role live, so this check isn't defense against a hypothetical).
//
// ── Booking/user batching (binding decision) ─────────────────────────────────
// One extra query for bookings (`engagement_id IN (...)`) and, only for
// marketplace bookings (`customer_user_id IS NOT NULL`), one extra query for
// users (`id IN (...)`) — never per-row. A booking's user row missing
// resolves `customer_name: null`, never a thrown error (a stale/deleted user
// account must not break the vendor's calendar view).
import {
  type Booking,
  EngagementStatus,
  type StaffEngagement,
  type User,
} from "@materialhub/database";
import type { ManageCalendarBookingSummary, ManageCalendarEngagement } from "@materialhub/dto";
import { UnprocessableEntityError } from "@materialhub/plugins";
import { In, type Repository } from "typeorm";
import {
  type LocationScopeRepos,
  assertLocationManager,
  getManagedLocationIds,
} from "../../guards/location-scope.ts";

const MAX_RANGE_DAYS = 62;
const DAY_MS = 86_400_000;

// All "occupied" statuses, across every engagement kind. released/cancelled
// are excluded (freed capacity has nothing to show on a calendar).
const CALENDAR_STATUSES = [
  EngagementStatus.held,
  EngagementStatus.confirmed,
  EngagementStatus.conflicted,
];

export interface CalendarActor {
  userId: string;
  vendorId: string;
  role: string;
}

export interface ListCalendarQuery {
  from?: string;
  to?: string;
  staffMemberId?: string;
  vendorLocationId?: string;
}

export class ManageCalendarService {
  constructor(
    private readonly engagementRepo: Repository<StaffEngagement>,
    private readonly bookingRepo: Repository<Booking>,
    private readonly userRepo: Repository<User>,
    private readonly locationScope: LocationScopeRepos,
  ) {}

  async list(actor: CalendarActor, query: ListCalendarQuery): Promise<ManageCalendarEngagement[]> {
    if (!query.from || !query.to) {
      throw new UnprocessableEntityError("from and to are required (ISO dates)");
    }
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new UnprocessableEntityError("from and to must be valid ISO dates");
    }
    if (to.getTime() < from.getTime()) {
      throw new UnprocessableEntityError("from must be on or before to");
    }
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
      throw new UnprocessableEntityError(`range must not exceed ${MAX_RANGE_DAYS} days`);
    }

    // Location scoping — identical resolution to BlockTimeService.list.
    let locationFilter: { vendorLocationId: string } | { managedLocationIds: string[] } | null =
      null;
    if (query.vendorLocationId) {
      await assertLocationManager(actor, query.vendorLocationId, this.locationScope);
      locationFilter = { vendorLocationId: query.vendorLocationId };
    } else {
      const managedLocationIds = await getManagedLocationIds(actor, this.locationScope);
      if (managedLocationIds !== null) {
        if (managedLocationIds.length === 0) return [];
        locationFilter = { managedLocationIds };
      }
    }

    const qb = this.engagementRepo
      .createQueryBuilder("e")
      .where("e.vendor_id = :vendorId", { vendorId: actor.vendorId })
      .andWhere("e.status IN (:...statuses)", { statuses: CALENDAR_STATUSES })
      .andWhere("e.starts_at < :to AND e.ends_at > :from", { from, to });

    if (query.staffMemberId) {
      qb.andWhere("e.staff_member_id = :staffMemberId", { staffMemberId: query.staffMemberId });
    }

    // ── Location scoping of the ROWS (review finding 5 — cross-branch PII) ──
    //
    // This previously scoped ONLY through the staff member's branch links:
    // `e.staff_member_id IN (SELECT … WHERE vendor_location_id = :id)`. A staff
    // member linked to branches A and B satisfies that predicate for BOTH, so a
    // request scoped to A pulled B's ENTIRE schedule — and mapBooking below
    // returns `customer_name`, `notes`, `price_fils` and `service_name`, so
    // that is a customer-PII disclosure across branches, not just noise.
    //
    // A BOOKING carries its own `location_id`, so it is scoped on that
    // directly — exactly what the MUTATION path already does
    // (manage-booking-actions.controller.ts's `authorize`), which is the
    // behaviour the two surfaces must agree on. A booking whose `location_id`
    // is NULL (home visit) has no branch and is therefore invisible to a
    // location-scoped actor, again matching the mutation path (which requires
    // owner/manager for those). Owner/vendor-manager actors have
    // `locationFilter === null` and skip all of this, unrestricted as before.
    //
    // Engagements with NO booking row (manual_block, break, external_import)
    // have no location of their own anywhere in the schema, so they keep the
    // staff-link scoping — they carry no customer PII, only "staff is busy".
    if (locationFilter) {
      const ids =
        "vendorLocationId" in locationFilter
          ? [locationFilter.vendorLocationId]
          : locationFilter.managedLocationIds;
      qb.andWhere(
        `(
          EXISTS (
            SELECT 1 FROM bookings b
            WHERE b.engagement_id = e.id AND b.deleted_at IS NULL
              AND b.location_id IN (:...scopedLocationIds)
          )
          OR (
            NOT EXISTS (
              SELECT 1 FROM bookings b2
              WHERE b2.engagement_id = e.id AND b2.deleted_at IS NULL
            )
            AND e.staff_member_id IN (
              SELECT sl.staff_member_id FROM staff_locations sl
              WHERE sl.vendor_location_id IN (:...scopedLocationIds)
                AND sl.deleted_at IS NULL
            )
          )
        )`,
        { scopedLocationIds: ids },
      );
    }

    const engagements = await qb.orderBy("e.starts_at", "ASC").getMany();
    if (engagements.length === 0) return [];

    // Batched booking lookup — one query, never per-row.
    const engagementIds = engagements.map((e) => e.id);
    const bookings = await this.bookingRepo.find({
      where: { engagement_id: In(engagementIds) },
    });
    const bookingByEngagementId = new Map(bookings.map((b) => [b.engagement_id, b]));

    // Batched user-name lookup, marketplace bookings only — one query, never
    // per-row.
    const marketplaceUserIds = [
      ...new Set(
        bookings.filter((b) => b.customer_user_id).map((b) => b.customer_user_id as string),
      ),
    ];
    const users = marketplaceUserIds.length
      ? await this.userRepo.find({
          where: { id: In(marketplaceUserIds) },
          select: ["id", "first_name", "last_name"],
        })
      : [];
    const userById = new Map(users.map((u) => [u.id, u]));

    return engagements.map((e) => {
      const booking = bookingByEngagementId.get(e.id);
      return {
        id: e.id,
        staff_member_id: e.staff_member_id,
        kind: e.kind,
        status: e.status,
        starts_at: toIso(e.starts_at),
        ends_at: toIso(e.ends_at),
        external_source: e.external_source,
        external_ref: e.external_ref,
        booking: booking ? this.mapBooking(booking, userById) : null,
      } as ManageCalendarEngagement;
    });
  }

  private mapBooking(
    booking: Booking,
    userById: Map<string, Pick<User, "id" | "first_name" | "last_name">>,
  ): ManageCalendarBookingSummary {
    let customerName: string | null;
    if (booking.customer_user_id) {
      const user = userById.get(booking.customer_user_id);
      customerName = user
        ? `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || null
        : null;
    } else {
      customerName = booking.customer_name ?? null;
    }
    return {
      id: booking.id,
      booking_number: booking.booking_number,
      status: booking.status,
      source: booking.source,
      payment_mode: booking.payment_mode,
      service_name: booking.service_name,
      price_fils: booking.price_fils,
      notes: booking.notes,
      location_id: booking.location_id,
      customer_name: customerName,
    } as ManageCalendarBookingSummary;
  }
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
