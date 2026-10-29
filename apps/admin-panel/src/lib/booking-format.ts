// Shared display helpers for the admin booking pages. Extracted rather than
// repeated per page: three pages need identical money and date rendering, and
// the existing admin pages each carry their own copy of formatDate, which has
// already drifted between them.

/** Money is stored in fils (1/100 AED) everywhere in the backend. */
export function formatFils(fils: number | null | undefined): string {
	if (fils == null) return "—";
	return `AED ${(fils / 100).toFixed(2)}`;
}

// starts_at/ends_at are timestamptz — rendering them in the admin's own
// browser timezone (the previous behaviour) silently shifts every UAE
// appointment for anyone not on GST, and admins act destructively on these
// times (complete/no-show are money events). The ideal fix resolves each
// booking's own location timezone (see apps/vendor-dashboard/src/lib/booking/tz.ts,
// which does exactly that), but the admin payload doesn't carry a per-booking
// timezone today. Hardcoding the marketplace timezone (Asia/Dubai, no DST) is
// the correct scope for this admin surface until that's available, as long as
// the rendered zone is visible so nobody misreads it as their own local time.
const MARKETPLACE_TIME_ZONE = "Asia/Dubai";

export function formatDateTime(iso: string | null | undefined): string {
	if (!iso) return "—";
	const formatted = new Date(iso).toLocaleString("en-AE", {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		timeZone: MARKETPLACE_TIME_ZONE,
	});
	return `${formatted} GST`;
}

export function formatDate(iso: string | null | undefined): string {
	if (!iso) return "—";
	return new Date(iso).toLocaleDateString("en-AE", {
		year: "numeric",
		month: "short",
		day: "numeric",
		// Same reasoning as formatDateTime above: without this a booking created
		// at 02:00 GST renders as the previous day for a UTC-based admin.
		timeZone: MARKETPLACE_TIME_ZONE,
	});
}

// Asia/Dubai is UTC+4 year-round (no DST), so a fixed offset is exact here and
// avoids pulling in a tz library for two boundary calculations.
const MARKETPLACE_UTC_OFFSET_HOURS = 4;

/**
 * Converts the date picker's selection into the instant bounds the API expects.
 *
 * react-day-picker returns each bound as LOCAL midnight of the chosen calendar
 * day. Passing `to` through unchanged made the backend's `starts_at <= :to`
 * exclude the entire last selected day. We therefore read only the calendar
 * Y/M/D off each Date — never the underlying instant — and re-anchor them to
 * 00:00:00.000 and 23:59:59.999 in the marketplace timezone, which is also the
 * timezone every row in the table is rendered in. That keeps an admin's filter
 * boundaries aligned with the column they're reading, whatever their own
 * browser timezone is.
 */
export function marketplaceDayRange(
	from: Date | undefined,
	to: Date | undefined,
): { from: string | undefined; to: string | undefined } {
	return {
		from: from && dayBoundaryIso(from, 0, 0, 0, 0),
		to: to && dayBoundaryIso(to, 23, 59, 59, 999),
	};
}

function dayBoundaryIso(
	day: Date,
	hours: number,
	minutes: number,
	seconds: number,
	ms: number,
): string {
	return new Date(
		Date.UTC(
			day.getFullYear(),
			day.getMonth(),
			day.getDate(),
			hours - MARKETPLACE_UTC_OFFSET_HOURS,
			minutes,
			seconds,
			ms,
		),
	).toISOString();
}
