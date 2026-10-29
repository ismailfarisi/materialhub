import { describe, expect, it } from "bun:test";
import {
	DEFAULT_END_MIN,
	DEFAULT_START_MIN,
	PX_PER_MIN,
	ROW_MINUTES,
	assignLanes,
	computeGridRange,
	durationToHeightPx,
	minutesToTopPx,
	snapTo15,
} from "./grid-layout";

describe("computeGridRange", () => {
	it("uses the business-hours default when everything fits inside it", () => {
		expect(
			computeGridRange([
				{ startMin: 9 * 60, endMin: 10 * 60 },
				{ startMin: 15 * 60, endMin: 16 * 60 },
			]),
		).toEqual({ startMin: DEFAULT_START_MIN, endMin: DEFAULT_END_MIN });
	});

	it("returns the default window when there is nothing booked", () => {
		expect(computeGridRange([])).toEqual({
			startMin: DEFAULT_START_MIN,
			endMin: DEFAULT_END_MIN,
		});
	});

	it("extends upward so an early walk-in is never hidden", () => {
		// A 07:10 start must still be visible — the grid opens at 07:00.
		const range = computeGridRange([{ startMin: 7 * 60 + 10, endMin: 8 * 60 }]);

		expect(range.startMin).toBe(7 * 60);
		expect(range.startMin).toBeLessThanOrEqual(7 * 60 + 10);
	});

	it("extends downward so a late booking's end is never clipped", () => {
		// 22:50 end must be inside the grid — ceil to the 23:00 row.
		const range = computeGridRange([{ startMin: 22 * 60, endMin: 22 * 60 + 50 }]);

		expect(range.endMin).toBe(23 * 60);
		expect(range.endMin).toBeGreaterThanOrEqual(22 * 60 + 50);
	});

	it("floors the start and ceils the end onto whole 30-minute rows", () => {
		const range = computeGridRange([{ startMin: 6 * 60 + 1, endMin: 22 * 60 + 1 }]);

		expect(range.startMin % ROW_MINUTES).toBe(0);
		expect(range.endMin % ROW_MINUTES).toBe(0);
		expect(range.startMin).toBe(6 * 60);
		expect(range.endMin).toBe(22 * 60 + 30);
	});

	it("never renders before midnight or past the end of the day", () => {
		const range = computeGridRange([{ startMin: -120, endMin: 24 * 60 + 90 }]);

		expect(range.startMin).toBe(0);
		expect(range.endMin).toBe(24 * 60);
	});

	it("expands to cover every engagement of the day, not just the last one", () => {
		const range = computeGridRange([
			{ startMin: 7 * 60, endMin: 8 * 60 },
			{ startMin: 12 * 60, endMin: 13 * 60 },
			{ startMin: 21 * 60, endMin: 23 * 60 },
		]);

		expect(range.startMin).toBe(7 * 60);
		expect(range.endMin).toBe(23 * 60);
	});
});

describe("pixel positioning", () => {
	it("places an engagement relative to the grid's own start, not midnight", () => {
		// 10:00 on a grid starting at 08:00 is 2 hours down.
		expect(minutesToTopPx(10 * 60, 8 * 60)).toBe(120 * PX_PER_MIN);
		expect(minutesToTopPx(8 * 60, 8 * 60)).toBe(0);
	});

	it("sizes a block by its duration", () => {
		expect(durationToHeightPx(60)).toBe(60 * PX_PER_MIN);
		expect(durationToHeightPx(30)).toBe(30 * PX_PER_MIN);
	});

	it("keeps a very short block tall enough to stay tappable", () => {
		expect(durationToHeightPx(5)).toBe(8 * PX_PER_MIN);
		expect(durationToHeightPx(0)).toBe(8 * PX_PER_MIN);
	});

	it("stacks two adjacent hour blocks without a gap or overlap", () => {
		const gridStart = 8 * 60;
		const firstTop = minutesToTopPx(9 * 60, gridStart);
		const firstHeight = durationToHeightPx(60);
		const secondTop = minutesToTopPx(10 * 60, gridStart);

		expect(firstTop + firstHeight).toBe(secondTop);
	});
});

describe("assignLanes", () => {
	it("keeps non-overlapping engagements in a single lane", () => {
		const lanes = assignLanes([
			{ id: "a", startMin: 540, endMin: 600 },
			{ id: "b", startMin: 600, endMin: 660 },
			{ id: "c", startMin: 700, endMin: 760 },
		]);

		expect(lanes.get("a")).toEqual({ lane: 0, laneCount: 1 });
		expect(lanes.get("b")).toEqual({ lane: 0, laneCount: 1 });
		expect(lanes.get("c")).toEqual({ lane: 0, laneCount: 1 });
	});

	it("splits a double-booked pair into side-by-side lanes", () => {
		const lanes = assignLanes([
			{ id: "a", startMin: 540, endMin: 660 },
			{ id: "b", startMin: 600, endMin: 720 },
		]);

		expect(lanes.get("a")?.lane).toBe(0);
		expect(lanes.get("b")?.lane).toBe(1);
		expect(lanes.get("a")?.laneCount).toBe(2);
		expect(lanes.get("b")?.laneCount).toBe(2);
	});

	it("gives every overlapping engagement in a triple-booking its own lane", () => {
		const lanes = assignLanes([
			{ id: "a", startMin: 540, endMin: 720 },
			{ id: "b", startMin: 560, endMin: 700 },
			{ id: "c", startMin: 580, endMin: 690 },
		]);

		const assigned = ["a", "b", "c"].map((id) => lanes.get(id)?.lane);
		expect(new Set(assigned).size).toBe(3);
		expect(lanes.get("a")?.laneCount).toBe(3);
	});

	it("treats a back-to-back handoff as non-overlapping", () => {
		// One ends exactly when the next begins — that is not a conflict.
		const lanes = assignLanes([
			{ id: "a", startMin: 540, endMin: 600 },
			{ id: "b", startMin: 600, endMin: 660 },
		]);

		expect(lanes.get("b")?.lane).toBe(0);
		expect(lanes.get("a")?.laneCount).toBe(1);
	});

	it("reuses a freed lane once the earlier engagement has ended", () => {
		const lanes = assignLanes([
			{ id: "a", startMin: 540, endMin: 600 },
			{ id: "b", startMin: 550, endMin: 620 },
			{ id: "c", startMin: 610, endMin: 700 },
		]);

		// c starts after a ends, so it drops back into lane 0.
		expect(lanes.get("c")?.lane).toBe(0);
		expect(lanes.get("b")?.lane).toBe(1);
		expect(lanes.get("c")?.laneCount).toBe(2);
	});

	it("assigns a lane to every input and never exceeds the lane count", () => {
		const items = [
			{ id: "a", startMin: 540, endMin: 720 },
			{ id: "b", startMin: 560, endMin: 700 },
			{ id: "c", startMin: 800, endMin: 860 },
		];
		const lanes = assignLanes(items);

		expect(lanes.size).toBe(items.length);
		for (const item of items) {
			const assignment = lanes.get(item.id);
			expect(assignment).toBeDefined();
			expect(assignment?.lane).toBeLessThan(assignment?.laneCount ?? 0);
		}
	});

	it("does not depend on the input order", () => {
		const items = [
			{ id: "b", startMin: 600, endMin: 720 },
			{ id: "a", startMin: 540, endMin: 660 },
		];
		const lanes = assignLanes(items);

		// Sorted internally by start time, so "a" is still the first lane.
		expect(lanes.get("a")?.lane).toBe(0);
		expect(lanes.get("b")?.lane).toBe(1);
	});

	it("reports at least one lane for an empty day", () => {
		expect(assignLanes([]).size).toBe(0);
	});
});

describe("snapTo15", () => {
	it("rounds a drag target to the nearest quarter hour", () => {
		expect(snapTo15(7)).toBe(0);
		expect(snapTo15(8)).toBe(15);
		expect(snapTo15(547)).toBe(540);
		expect(snapTo15(548)).toBe(555);
	});
});
