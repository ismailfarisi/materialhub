import type { Booking } from "@/lib/booking/types";
import { isValidTimeZone } from "@/lib/utils";

/**
 * Shared display helpers for the customer bookings pages (list / detail /
 * reschedule). Both the timezone resolution and the reschedule-window rule
 * used to be duplicated per-page; this is the ONE place for each.
 */

/**
 * Last-resort display zone — matches booking-service's own
 * AvailabilityService DEFAULT_TIMEZONE and the availability picker's
 * pre-fetch guess. Only used when the booking carries no zone of its own,
 * and when it is used the zone is ALWAYS labelled in the UI (see
 * `resolveBookingTimeZone().confirmed`) rather than silently asserted.
 */
export const FALLBACK_DISPLAY_TZ = "Asia/Dubai";

export interface ResolvedBookingZone {
  timeZone: string;
  /**
   * True when the zone came from the booking itself. False means we are
   * GUESSING and the UI must say so — vendors can pick Asia/Riyadh,
   * Africa/Cairo, Asia/Kolkata, UTC or an arbitrary preserved zone in
   * LocationForm, so "Asia/Dubai" is not a safe silent default.
   */
  confirmed: boolean;
}

/**
 * TODO(backend): `bookings` has no timezone of its own — only
 * `vendor_locations.timezone` does, and home-visit bookings have
 * `location_id = null`. Until the backend stamps one, this falls back to
 * FALLBACK_DISPLAY_TZ and the caller labels the zone explicitly.
 *
 * Required backend change (booking-service):
 *   1. Snapshot the resolved zone onto the booking at creation — a
 *      `timezone` column on the `bookings` entity, filled in
 *      `BookingService.create` / `RescheduleService` using the same
 *      resolution order as `AvailabilityService.resolveTimezone()`
 *      (chosen location's tz → vendor's first active location → default).
 *      A snapshot (not a join) is right here: the same reason price/VAT are
 *      snapshotted — a vendor moving a location later must not retroactively
 *      change what an already-confirmed customer was told.
 *   2. Expose it on the read path in
 *      `backend/apps/booking-service/src/domain/booking/booking-query.service.ts`
 *      (the `get`/`listMine` mappers) so `GET /bookings` and
 *      `GET /bookings/:id` both return `timezone`.
 *   3. Add `timezone: string` to `apps/web/src/lib/booking/types.ts`'s
 *      `Booking`, then this helper's `confirmed` branch takes over with no
 *      further UI change.
 */
export function resolveBookingTimeZone(booking: Booking): ResolvedBookingZone {
  const stamped = (booking as Booking & { timezone?: unknown }).timezone;
  if (typeof stamped === "string" && isValidTimeZone(stamped)) {
    return { timeZone: stamped, confirmed: true };
  }
  return { timeZone: FALLBACK_DISPLAY_TZ, confirmed: false };
}

/**
 * ADVISORY client-side mirror of the backend's `isWithinRescheduleWindow`
 * (booking-policy.ts). Boundary-inclusive (<=), matching the backend's
 * shared `isWithinWindow` >= check.
 *
 * This must NEVER hard-block: it gates on the BROWSER's clock, so a skewed
 * device would lock a customer out of a reschedule the server would happily
 * accept, with no escape path. Per the repo rule "client gates must be no
 * stricter than the server's", callers show a warning and let the customer
 * proceed — the server is the authority and already answers
 * `422 reschedule_window_expired`, which
 * booking-reschedule-confirm.tsx handles.
 */
export function rescheduleWindowOpen(booking: Booking, now = new Date()): boolean {
  const startsAtMs = new Date(booking.starts_at).getTime();
  const windowMs = booking.reschedule_window_hours * 60 * 60 * 1000;
  return now.getTime() <= startsAtMs - windowMs;
}
