// Pure layout math for the calendar grid (Task 6) — no React, no timezone
// I/O (callers pass already-zoned minute offsets). Kept separate from
// tz.ts so the positioning math is trivially unit-testable in isolation.

/** Pixels per minute — 48px per 30-min row, legible at a glance. */
export const PX_PER_MIN = 1.6;
export const ROW_MINUTES = 30;
export const ROW_PX = ROW_MINUTES * PX_PER_MIN; // 48

/** Business-hours default window; extended to fit outlying engagements. */
export const DEFAULT_START_MIN = 8 * 60;
export const DEFAULT_END_MIN = 22 * 60;

/**
 * The grid's vertical range (in minutes-from-midnight), floored/ceiled to
 * the nearest 30-min row and defaulting to 08:00-22:00 — but NEVER clipping
 * a real engagement out of view (extends past the default window if a
 * walk-in starts at 07:00 or a late booking ends at 23:00, rather than
 * silently hiding it).
 */
export function computeGridRange(minuteBounds: Array<{ startMin: number; endMin: number }>): {
	startMin: number;
	endMin: number;
} {
	let startMin = DEFAULT_START_MIN;
	let endMin = DEFAULT_END_MIN;
	for (const { startMin: s, endMin: e } of minuteBounds) {
		if (s < startMin) startMin = Math.floor(s / ROW_MINUTES) * ROW_MINUTES;
		if (e > endMin) endMin = Math.ceil(e / ROW_MINUTES) * ROW_MINUTES;
	}
	// Never render past a real calendar day.
	startMin = Math.max(0, startMin);
	endMin = Math.min(24 * 60, endMin);
	return { startMin, endMin };
}

export function minutesToTopPx(minuteFromMidnight: number, gridStartMin: number): number {
	return (minuteFromMidnight - gridStartMin) * PX_PER_MIN;
}

export function durationToHeightPx(durationMinutes: number): number {
	return Math.max(durationMinutes, 8) * PX_PER_MIN; // floor so a 5-min block is still tappable
}

export function snapTo15(minutesFromMidnight: number): number {
	return Math.round(minutesFromMidnight / 15) * 15;
}

// ─── Overlap lanes ──────────────────────────────────────────────────────
// Greedy interval-graph coloring — good enough for a calendar's typically
// low overlap count (a conflicted pair is the common case: 2 lanes).

export interface LaneAssignment {
	lane: number;
	laneCount: number;
}

export function assignLanes(
	items: Array<{ id: string; startMin: number; endMin: number }>,
): Map<string, LaneAssignment> {
	const sorted = [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
	const laneEnds: number[] = [];
	const laneOf = new Map<string, number>();
	for (const item of sorted) {
		let placedLane = -1;
		for (let i = 0; i < laneEnds.length; i++) {
			if (laneEnds[i] <= item.startMin) {
				placedLane = i;
				laneEnds[i] = item.endMin;
				break;
			}
		}
		if (placedLane === -1) {
			placedLane = laneEnds.length;
			laneEnds.push(item.endMin);
		}
		laneOf.set(item.id, placedLane);
	}
	const laneCount = Math.max(1, laneEnds.length);
	const result = new Map<string, LaneAssignment>();
	for (const item of sorted) {
		result.set(item.id, { lane: laneOf.get(item.id) ?? 0, laneCount });
	}
	return result;
}
