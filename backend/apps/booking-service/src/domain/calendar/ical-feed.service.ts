// ical-feed.service.ts
//
// Phase 6 Task 5 (docs/superpowers/plans/2026-07-08-booking-phase-6-offplatform.md,
// "Outbound iCal feed") — the reverse direction of Task 4's inbound import
// (ical-import.service.ts): a vendor's OTHER platform (Google Calendar,
// Fresha, Outlook, ...) subscribes to a MaterialHub `.ics` URL for one staff
// member, so MaterialHub capacity blocks THAT calendar too.
// `IcalFeedService.forStaff(staffId, now?)` loads that staff member's
// engagements and renders them via Task 3's pure `generateICal`
// (ical-feed.ts). Route-level auth (the signed token) lives in
// ical-feed-token.ts / ical-feed.routes.ts — this service assumes the
// caller has already verified the request is authorized for `staffId`.
//
// ── Inclusion filter (status = confirmed, kind != external_import) ─────────
// Only `confirmed` engagements are a real commitment worth blocking another
// platform's calendar for — `held` (a customer mid-checkout), `released`,
// `cancelled`, and `conflicted` (an unresolved double-booking the vendor
// still has to sort out) are all excluded.
//
// Excluding `external_import` is the loop-avoidance rule: those rows were
// pulled INTO MaterialHub from a vendor's external calendar by Task 4's poller
// in the first place. Echoing them back out on this feed would let the same
// external platform (or a second one also subscribed to this feed) re-import
// its own events through MaterialHub — an echo/sync loop. The filtering happens
// in application code (not solely in the DB query) so it's exercised
// directly by the mocked unit tests below.
//
// ── Time window (constants, not config — see brief) ─────────────────────────
// `[now - PAST_WINDOW_DAYS, now + FUTURE_WINDOW_MONTHS]`. The 1-day trailing
// edge catches an engagement that started before `now` but hasn't ended yet
// (e.g. an overnight block); the ~6-month forward edge keeps the feed bounded
// — an unbounded feed would grow forever as the ledger accumulates history,
// and no legitimate external-calendar consumer needs bookings further out
// than that.
//
// ── Privacy: NO customer PII ─────────────────────────────────────────────────
// This `.ics` is fetched by a vendor's OTHER platform / calendar app, outside
// MaterialHub's own access control — SUMMARY is a generic, kind-derived string
// ('MaterialHub booking' for marketplace_booking/walk_in/phone, 'Blocked' for
// manual_block/break), never a customer name, phone number, or service name.
// LOCATION/DESCRIPTION (both optional on Task 3's `generateICal`) are never
// populated. UID is `engagement-{id}@materialhubuae.com` — an opaque internal id,
// not the booking id or any customer-identifying value.
import { EngagementKind, EngagementStatus, type StaffEngagement } from "@materialhub/database";
import { LessThan, MoreThan, type Repository } from "typeorm";
import { generateICal } from "./ical-feed.ts";

/** Trailing window: how far into the past a still-open engagement may start. */
export const PAST_WINDOW_DAYS = 1;
/** Forward window: how far into the future the feed includes engagements. */
export const FUTURE_WINDOW_MONTHS = 6;

function addUtcMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

/** Generic, PII-free SUMMARY text derived from the engagement's kind. */
export function genericSummaryForKind(kind: EngagementKind): string {
  switch (kind) {
    case EngagementKind.marketplace_booking:
    case EngagementKind.walk_in:
    case EngagementKind.phone:
      return "MaterialHub booking";
    case EngagementKind.manual_block:
    case EngagementKind.break:
      return "Blocked";
    default:
      // external_import never reaches here (filtered out before mapping),
      // but a generic fallback keeps this exhaustive against a future kind.
      return "Blocked";
  }
}

export class IcalFeedService {
  constructor(private readonly engagementRepo: Repository<StaffEngagement>) {}

  /**
   * Builds the `.ics` document for `staffId`. `now` is injectable for
   * deterministic tests (defaults to `new Date()` at the call site, never
   * inside a pure helper) — passed straight through to `generateICal`'s
   * DTSTAMP and used to derive the window bounds.
   */
  async forStaff(staffId: string, now: Date = new Date()): Promise<string> {
    const windowStart = new Date(now.getTime() - PAST_WINDOW_DAYS * 24 * 3_600_000);
    const windowEnd = addUtcMonths(now, FUTURE_WINDOW_MONTHS);

    // DB narrows to the time window; the confirmed/non-external_import
    // filter runs in application code below (see header note on why).
    const engagements = await this.engagementRepo.find({
      where: {
        staff_member_id: staffId,
        starts_at: LessThan(windowEnd),
        ends_at: MoreThan(windowStart),
      },
      order: { starts_at: "ASC" },
    });

    const events = engagements
      .filter(
        (e) => e.status === EngagementStatus.confirmed && e.kind !== EngagementKind.external_import,
      )
      .map((e) => ({
        uid: `engagement-${e.id}@materialhubuae.com`,
        summary: genericSummaryForKind(e.kind),
        startsAt: e.starts_at,
        endsAt: e.ends_at,
      }));

    return generateICal(events, { now, calName: "MaterialHub Bookings" });
  }
}
