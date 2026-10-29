import type {
  ServiceArea,
  ServiceOffering,
  StaffEngagement,
  StaffMember,
  StaffTimeOff,
  StaffWorkingHours,
  VendorHoliday,
  VendorLocation,
} from "@materialhub/database";
import { NotFoundError } from "@materialhub/plugins";
import { IsNull, type Repository } from "typeorm";
import type { AvailabilityCache } from "./availability-cache.ts";
import {
  type Interval,
  type WeeklyRule,
  composeSlots,
  dayRangeUtc,
  expandWorkingHours,
  localDaysInRange,
  subtractIntervals,
} from "./interval-math.ts";

// Engagement statuses that occupy a staff member's time. `conflicted` counts as
// busy: a Phase 6 iCal collision must not be resold while unresolved. Only
// `released`/`cancelled` free the range.
const BUSY_STATUSES = ["held", "confirmed", "conflicted"];

const DEFAULT_TIMEZONE = "Asia/Dubai";

// Bound on how many staff a single anonymous request may fan out over. Each
// staff member costs 3 DB queries plus a cache batch, and the endpoint is
// public and unauthenticated, so the staff dimension is clamped just like the
// 62-day range dimension. Vendors with more bookable staff than this per branch
// are expected to pass ?staff= (the PDP picker does).
const MAX_ELIGIBLE_STAFF = 25;

export interface GetAvailabilityParams {
  offeringId: string;
  locationId?: string;
  customerAreaId?: string;
  staffId?: string;
  from: Date;
  to: Date;
  now?: Date;
}

export interface AvailabilitySlot {
  start: string;
  end: string;
  staff_options: string[];
}

export interface AvailabilityResult {
  offering_id: string;
  timezone: string;
  mode: "at_premises" | "home_visit";
  slots: AvailabilitySlot[];
}

export class AvailabilityService {
  constructor(
    private readonly offeringRepo: Repository<ServiceOffering>,
    private readonly staffRepo: Repository<StaffMember>,
    private readonly workingHoursRepo: Repository<StaffWorkingHours>,
    private readonly timeOffRepo: Repository<StaffTimeOff>,
    private readonly engagementRepo: Repository<StaffEngagement>,
    private readonly locationRepo: Repository<VendorLocation>,
    private readonly holidayRepo: Repository<VendorHoliday>,
    private readonly serviceAreaRepo: Repository<ServiceArea>,
    private readonly cache: AvailabilityCache,
  ) {}

  async getAvailability(params: GetAvailabilityParams): Promise<AvailabilityResult> {
    const now = params.now ?? new Date();
    const offering = await this.offeringRepo.findOne({ where: { id: params.offeringId } });
    if (!offering) throw new NotFoundError("Service offering not found");

    // Decide premises vs home-visit and the travel buffer.
    const wantsHomeVisit = !!params.customerAreaId;
    const supportsHomeVisit =
      offering.location_mode === "home_visit" || offering.location_mode === "either";
    const supportsPremises =
      offering.location_mode === "at_premises" || offering.location_mode === "either";

    let travelBufferMinutes = 0;
    let mode: "at_premises" | "home_visit" = "at_premises";
    if (wantsHomeVisit) {
      // Home-visit path: the vendor must serve the customer's area, else no slots.
      if (!supportsHomeVisit) return this.empty(offering, DEFAULT_TIMEZONE, "home_visit");
      const area = await this.serviceAreaRepo.findOne({
        where: { vendor_id: offering.vendor_id, area_id: params.customerAreaId },
      });
      if (!area) return this.empty(offering, DEFAULT_TIMEZONE, "home_visit");
      travelBufferMinutes = area.travel_buffer_minutes ?? 0;
      mode = "home_visit";
    } else if (!supportsPremises) {
      // Premises requested but the offering is home-visit-only.
      return this.empty(offering, DEFAULT_TIMEZONE, "at_premises");
    }

    // Premises bookings are branch-bound. If the caller did not name a branch we
    // resolve the vendor's default (oldest active) one and scope EVERYTHING —
    // staff, working hours and timezone — to it, rather than returning the union
    // of every branch under a single (arbitrary) branch's timezone.
    const branch = await this.resolveBranch(offering.vendor_id, params.locationId);
    const timezone = branch?.timezone ?? DEFAULT_TIMEZONE;
    // Home visits are not premises-bound, so they are never branch-scoped; the
    // branch only supplies the timezone.
    const branchId = mode === "at_premises" ? branch?.id : undefined;
    const staff = await this.resolveEligibleStaff(offering, params, branchId);
    if (staff.length === 0) return this.empty(offering, timezone, mode);

    const days = localDaysInRange(params.from, params.to, timezone);
    // Holidays are resolved OUTSIDE the cached closure: they are written by
    // vendor-service, which holds no reference to this cache and emits no
    // invalidation signal, so anything cached with holidays baked in would keep
    // selling slots on a closed day for a full TTL. Subtracting them per request
    // removes the staleness entirely; the cost is one extra (already-loaded)
    // interval subtraction per staff-day.
    const holidays = await this.loadHolidays(offering.vendor_id, params.from, params.to, timezone);

    // start ISO → merged slot with the staff who can serve it.
    const byStart = new Map<string, AvailabilitySlot>();

    for (const member of staff) {
      const rules = await this.loadRules(member.id, branchId);
      if (rules.length === 0) continue;
      const busy = await this.loadBusy(member.id, params.from, params.to);

      // One batched cache round trip for the whole range instead of one per day.
      const freeByDay = await this.cache.getOrComputeMany(
        member.id,
        timezone,
        days,
        async (day) => {
          const bounds = dayRangeUtc(day, timezone);
          const working = expandWorkingHours(rules, bounds, timezone);
          return subtractIntervals(working, busy);
        },
      );

      for (const day of days) {
        const free = subtractIntervals(freeByDay.get(day) ?? [], holidays);
        const slots = composeSlots(
          free,
          {
            durationMinutes: offering.duration_minutes,
            bufferBeforeMinutes: offering.buffer_before_minutes,
            bufferAfterMinutes: offering.buffer_after_minutes,
            slotStepMinutes: offering.slot_step_minutes,
            minNoticeMinutes: offering.min_notice_minutes,
            maxAdvanceDays: offering.max_advance_days,
            travelBufferMinutes,
          },
          now,
        );
        for (const s of slots) {
          const key = s.start.toISOString();
          const existing = byStart.get(key);
          if (existing) {
            existing.staff_options.push(member.id);
          } else {
            byStart.set(key, {
              start: key,
              end: s.end.toISOString(),
              staff_options: [member.id],
            });
          }
        }
      }
    }

    const slots = [...byStart.values()].sort((a, b) => a.start.localeCompare(b.start));
    return { offering_id: offering.id, timezone, mode, slots };
  }

  private empty(
    offering: ServiceOffering,
    timezone: string,
    mode: "at_premises" | "home_visit",
  ): AvailabilityResult {
    return { offering_id: offering.id, timezone, mode, slots: [] };
  }

  // staff_service ∩ (staff_location for premises) ∩ active, optionally one staff.
  private resolveEligibleStaff(
    offering: ServiceOffering,
    params: GetAvailabilityParams,
    branchId?: string,
  ): Promise<StaffMember[]> {
    const qb = this.staffRepo
      .createQueryBuilder("s")
      .innerJoin(
        "staff_services",
        "ss",
        "ss.staff_member_id = s.id AND ss.service_offering_id = :offeringId AND ss.deleted_at IS NULL",
        { offeringId: offering.id },
      )
      .where("s.deleted_at IS NULL")
      .andWhere("s.is_active = true")
      .andWhere("s.vendor_id = :vendorId", { vendorId: offering.vendor_id });

    // Premises visits are branch-bound; home-visits are not (branchId is
    // undefined for those, and for vendors that have no location rows at all).
    if (branchId) {
      qb.innerJoin(
        "staff_locations",
        "sl",
        "sl.staff_member_id = s.id AND sl.vendor_location_id = :locationId AND sl.deleted_at IS NULL",
        { locationId: branchId },
      );
    }
    if (params.staffId) qb.andWhere("s.id = :staffId", { staffId: params.staffId });
    return qb.orderBy("s.name", "ASC").take(MAX_ELIGIBLE_STAFF).getMany();
  }

  // The branch this request is about: the requested one, else the vendor's
  // default (oldest active) location. Supplies both the timezone and the
  // premises scope. Null only if the vendor has no active location at all.
  private async resolveBranch(
    vendorId: string,
    locationId?: string,
  ): Promise<VendorLocation | null> {
    if (locationId) {
      const loc = await this.locationRepo.findOne({ where: { id: locationId } });
      if (loc) return loc;
    }
    return this.locationRepo.findOne({
      where: { vendor_id: vendorId, is_active: true },
      order: { created_at: "ASC" },
    });
  }

  // Working hours for a staff member, scoped to the branch when one applies.
  // A rule with a NULL location_id is a vendor-wide shift that applies at EVERY
  // branch (the column is optional and defaults to null); a rule naming another
  // branch must not leak into this branch's availability, or we would offer a
  // slot the staff member spends 20km away.
  private async loadRules(staffId: string, branchId?: string): Promise<WeeklyRule[]> {
    const rows = await this.workingHoursRepo.find({
      where: branchId
        ? [
            { staff_member_id: staffId, location_id: IsNull() },
            { staff_member_id: staffId, location_id: branchId },
          ]
        : { staff_member_id: staffId },
    });
    return rows.map((r) => ({
      day_of_week: r.day_of_week,
      start_time: r.start_time,
      end_time: r.end_time,
      effective_from: r.effective_from,
      effective_to: r.effective_to,
    }));
  }

  // Busy = active engagements + time-off overlapping [from, to].
  private async loadBusy(staffId: string, from: Date, to: Date): Promise<Interval[]> {
    const engagements = await this.engagementRepo
      .createQueryBuilder("e")
      .where("e.staff_member_id = :staffId", { staffId })
      .andWhere("e.status IN (:...statuses)", { statuses: BUSY_STATUSES })
      .andWhere("e.starts_at < :to AND e.ends_at > :from", { from, to })
      .getMany();
    const timeOff = await this.timeOffRepo
      .createQueryBuilder("t")
      .where("t.staff_member_id = :staffId", { staffId })
      .andWhere("t.deleted_at IS NULL")
      .andWhere("t.starts_at < :to AND t.ends_at > :from", { from, to })
      .getMany();
    return [
      ...engagements.map((e) => ({ start: new Date(e.starts_at), end: new Date(e.ends_at) })),
      ...timeOff.map((t) => ({ start: new Date(t.starts_at), end: new Date(t.ends_at) })),
    ];
  }

  // Vendor-wide holidays as full-day busy intervals. The stored values are
  // date-only and mean LOCAL calendar days at the branch, so they are expanded
  // through dayRangeUtc in the branch timezone — expanding them as UTC days
  // would leave the tail of the local holiday (e.g. 20:00–24:00 in
  // America/New_York) bookable.
  private async loadHolidays(
    vendorId: string,
    from: Date,
    to: Date,
    timezone: string,
  ): Promise<Interval[]> {
    const rows = await this.holidayRepo
      .createQueryBuilder("h")
      .where("h.vendor_id = :vendorId", { vendorId })
      .andWhere("h.deleted_at IS NULL")
      .andWhere("h.starts_at <= :to AND h.ends_at >= :from", {
        from: dateOnly(from),
        to: dateOnly(to),
      })
      .getMany();
    return rows.map((h) => ({
      start: dayRangeUtc(dateOnly(h.starts_at), timezone).from,
      // ends_at is inclusive → cover through the end of that local day.
      end: dayRangeUtc(dateOnly(h.ends_at), timezone).to,
    }));
  }
}

function dateOnly(d: Date | string): string {
  const iso = typeof d === "string" ? d : d.toISOString();
  return iso.slice(0, 10);
}
