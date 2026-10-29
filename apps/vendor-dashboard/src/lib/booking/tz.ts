// Timezone helpers for the vendor calendar (Task 6). All grid positioning,
// date-strip keys, and create/drag time math must be computed in the
// SELECTED LOCATION's timezone, never the browser's — mirrors the proven
// Intl-based pattern from apps/web/src/lib/utils.ts (dateKeyInZone /
// todayKeyInZone / addDaysToDateKey / dateKeyToUtcIso), reimplemented here
// (no shared package between apps/web and apps/vendor-dashboard) plus two
// additions this screen specifically needs:
//   - `zonedPartsFromIso` / `minutesSinceMidnightInZone` — read the
//     hour/minute of a UTC instant AS IT APPEARS in an arbitrary IANA zone,
//     for positioning an engagement block inside the day's row grid.
//   - `wallClockInZoneToIso` — the inverse: given a calendar date + a
//     minutes-from-midnight offset meant to be read in that zone, produce
//     the correct UTC ISO instant. Needed for click-to-create prefill and
//     for computing the new starts_at/ends_at when a block is dragged.
//     Uses the standard two-pass Intl correction (works for ANY IANA zone,
//     including ones that observe DST, unlike the fixed +4 Dubai-only
//     shortcut TimeOffPanel.tsx uses — the calendar's location filter can
//     be any of LocationForm's curated Gulf/common zones, not just Dubai).

/** "YYYY-MM-DD" / hour / minute as they appear in `timeZone` for a UTC ISO instant. */
export function zonedPartsFromIso(
	iso: string,
	timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number } {
	const dtf = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hourCycle: "h23",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	});
	const parts = dtf.formatToParts(new Date(iso));
	const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
	return {
		year: get("year"),
		month: get("month"),
		day: get("day"),
		hour: get("hour") % 24, // "24" edge case some environments return for midnight
		minute: get("minute"),
	};
}

/** "YYYY-MM-DD" for a UTC ISO instant, in `timeZone`. */
export function dateKeyInZone(iso: string, timeZone: string): string {
	return new Date(iso).toLocaleDateString("en-CA", { timeZone });
}

/** "YYYY-MM-DD" for "today", in `timeZone`. */
export function todayKeyInZone(timeZone: string): string {
	return new Date().toLocaleDateString("en-CA", { timeZone });
}

/** Pure calendar-date integer math — never routes through a real timezone. */
export function addDaysToDateKey(key: string, days: number): string {
	const [year, month, day] = key.split("-").map(Number);
	const anchor = new Date(Date.UTC(year, month - 1, day));
	anchor.setUTCDate(anchor.getUTCDate() + days);
	return anchor.toISOString().slice(0, 10);
}

/** UTC-midnight ISO instant for a "YYYY-MM-DD" key (pair with timeZone:"UTC" when formatting). */
export function dateKeyToUtcIso(key: string): string {
	return `${key}T00:00:00.000Z`;
}

/** 0=Sunday..6=Saturday for a "YYYY-MM-DD" key — pure calendar math. */
export function weekdayOfDateKey(key: string): number {
	return new Date(dateKeyToUtcIso(key)).getUTCDay();
}

/** The Sunday on/before `key` (platform convention: weeks start Sunday). */
export function startOfWeekKey(key: string): string {
	return addDaysToDateKey(key, -weekdayOfDateKey(key));
}

/** Minutes since local midnight (in `timeZone`) for a UTC ISO instant. */
export function minutesSinceMidnightInZone(iso: string, timeZone: string): number {
	const { hour, minute } = zonedPartsFromIso(iso, timeZone);
	return hour * 60 + minute;
}

/**
 * The engagement's end minute, clipped to end-of-day for rendering within a
 * SINGLE day's grid column. An engagement that genuinely crosses midnight
 * (rare — an overnight block/break) renders as extending to the bottom of
 * the day it started in; full cross-midnight, multi-column rendering is out
 * of scope for the calendar grid (accepted limitation — see task-6-report.md).
 */
export function dayClippedEndMinutes(startsAt: string, endsAt: string, timeZone: string): number {
	const startMin = minutesSinceMidnightInZone(startsAt, timeZone);
	const endMin = minutesSinceMidnightInZone(endsAt, timeZone);
	if (endMin <= startMin) return 24 * 60;
	return endMin;
}

/**
 * Inverse of the above: given a "YYYY-MM-DD" date key and a
 * minutes-from-midnight offset, both meant to be read as wall-clock time IN
 * `timeZone`, produce the UTC ISO instant. Two-pass Intl correction — exact
 * for any IANA zone except within the same minute as a DST transition
 * (accepted, documented residual — same class as other tz edges in this repo).
 */
export function wallClockInZoneToIso(dateKey: string, minutesFromMidnight: number, timeZone: string): string {
	const [year, month, day] = dateKey.split("-").map(Number);
	const hour = Math.floor(minutesFromMidnight / 60);
	const minute = minutesFromMidnight % 60;
	const wantMs = Date.UTC(year, month - 1, day, hour, minute);

	// First guess: treat the wanted wall-clock as if it were already UTC.
	const guess = new Date(wantMs);
	const got = zonedPartsFromIso(guess.toISOString(), timeZone);
	const gotMs = Date.UTC(got.year, got.month - 1, got.day, got.hour, got.minute);

	// Correct the guess by however far off it landed in the target zone.
	const correctedMs = wantMs + (wantMs - gotMs);
	return new Date(correctedMs).toISOString();
}

/** Wall-clock time-of-day (e.g. "9:30 AM"), rendered in `timeZone`. */
export function formatTimeInZone(iso: string, timeZone: string): string {
	return new Date(iso).toLocaleTimeString("en-AE", {
		hour: "numeric",
		minute: "2-digit",
		timeZone,
	});
}

/** Short weekday + day-of-month label (e.g. "Sun 12"), rendered in `timeZone`. */
export function formatDayLabelInZone(iso: string, timeZone: string): string {
	return new Date(iso).toLocaleDateString("en-AE", {
		weekday: "short",
		day: "numeric",
		timeZone,
	});
}

/** Full date label (e.g. "Sunday, 12 July 2026"), rendered in `timeZone` — for the toolbar header. */
export function formatFullDateInZone(iso: string, timeZone: string): string {
	return new Date(iso).toLocaleDateString("en-AE", {
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric",
		timeZone,
	});
}

/** Round a minutes-from-midnight offset to the nearest 15-minute increment. */
export function snapTo15(minutesFromMidnight: number): number {
	return Math.round(minutesFromMidnight / 15) * 15;
}
