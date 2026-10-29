import { describe, expect, it } from "bun:test";
import {
	addDaysToDateKey,
	dateKeyInZone,
	dayClippedEndMinutes,
	minutesSinceMidnightInZone,
	snapTo15,
	startOfWeekKey,
	wallClockInZoneToIso,
	weekdayOfDateKey,
	zonedPartsFromIso,
} from "./tz";

/**
 * Every helper here decides where a booking lands on the vendor's calendar.
 * A leak of the *browser's* timezone puts an appointment on the wrong day or
 * the wrong row, so each case pins an explicit instant and an explicit zone —
 * including a DST-observing zone, since the location filter is not
 * Dubai-only.
 */

describe("zonedPartsFromIso", () => {
	it("reads the wall-clock parts as they appear in the target zone", () => {
		// 2026-03-10T06:30Z is 10:30 on the same day in Asia/Dubai (UTC+4).
		expect(zonedPartsFromIso("2026-03-10T06:30:00.000Z", "Asia/Dubai")).toEqual({
			year: 2026,
			month: 3,
			day: 10,
			hour: 10,
			minute: 30,
		});
	});

	it("rolls the date forward when the zone is ahead of the UTC day", () => {
		expect(zonedPartsFromIso("2026-03-10T21:30:00.000Z", "Asia/Dubai")).toMatchObject({
			day: 11,
			hour: 1,
			minute: 30,
		});
	});

	it("reports midnight as hour 0, never 24", () => {
		expect(zonedPartsFromIso("2026-03-09T20:00:00.000Z", "Asia/Dubai").hour).toBe(0);
	});
});

describe("minutesSinceMidnightInZone", () => {
	it("positions a block by its local time, not its UTC time", () => {
		// 06:30Z = 10:30 Dubai = 630 minutes from local midnight.
		expect(minutesSinceMidnightInZone("2026-03-10T06:30:00.000Z", "Asia/Dubai")).toBe(630);
		expect(minutesSinceMidnightInZone("2026-03-10T06:30:00.000Z", "UTC")).toBe(390);
	});

	it("returns 0 at local midnight", () => {
		expect(minutesSinceMidnightInZone("2026-03-09T20:00:00.000Z", "Asia/Dubai")).toBe(0);
	});
});

describe("dayClippedEndMinutes", () => {
	it("returns the plain end minute for a same-day engagement", () => {
		expect(
			dayClippedEndMinutes(
				"2026-03-10T06:00:00.000Z", // 10:00 Dubai
				"2026-03-10T07:30:00.000Z", // 11:30 Dubai
				"Asia/Dubai",
			),
		).toBe(11 * 60 + 30);
	});

	it("clips a cross-midnight engagement to the end of its starting day", () => {
		// 23:00 -> 01:00 Dubai: the end minute (60) is less than the start
		// minute (1380), so it must render to the bottom of the day rather
		// than inverting into a negative-height block.
		const end = dayClippedEndMinutes(
			"2026-03-10T19:00:00.000Z",
			"2026-03-10T21:00:00.000Z",
			"Asia/Dubai",
		);

		expect(end).toBe(24 * 60);
		expect(end).toBeGreaterThan(
			minutesSinceMidnightInZone("2026-03-10T19:00:00.000Z", "Asia/Dubai"),
		);
	});

	it("clips a zero-length engagement to the end of the day rather than collapsing", () => {
		expect(
			dayClippedEndMinutes("2026-03-10T06:00:00.000Z", "2026-03-10T06:00:00.000Z", "Asia/Dubai"),
		).toBe(24 * 60);
	});
});

describe("wallClockInZoneToIso", () => {
	it("round-trips a Dubai wall-clock time back to the same minutes offset", () => {
		const iso = wallClockInZoneToIso("2026-03-10", 9 * 60 + 30, "Asia/Dubai");

		expect(iso).toBe("2026-03-10T05:30:00.000Z");
		expect(minutesSinceMidnightInZone(iso, "Asia/Dubai")).toBe(9 * 60 + 30);
		expect(dateKeyInZone(iso, "Asia/Dubai")).toBe("2026-03-10");
	});

	it("round-trips in a DST-observing zone on a normal day", () => {
		// A fixed +4 shortcut would be wrong here; the two-pass Intl
		// correction must handle an arbitrary IANA offset.
		const iso = wallClockInZoneToIso("2026-06-15", 14 * 60, "Europe/London");

		expect(minutesSinceMidnightInZone(iso, "Europe/London")).toBe(14 * 60);
		expect(dateKeyInZone(iso, "Europe/London")).toBe("2026-06-15");
	});

	it("round-trips on both sides of a DST transition", () => {
		// 2026-10-25 is the EU fall-back date. A time well clear of the
		// transition itself must still land exactly.
		for (const dateKey of ["2026-10-24", "2026-10-25", "2026-10-26"]) {
			const iso = wallClockInZoneToIso(dateKey, 15 * 60, "Europe/London");
			expect({
				dateKey,
				minutes: minutesSinceMidnightInZone(iso, "Europe/London"),
				day: dateKeyInZone(iso, "Europe/London"),
			}).toEqual({ dateKey, minutes: 15 * 60, day: dateKey });
		}
	});

	it("round-trips across a US spring-forward date", () => {
		for (const dateKey of ["2026-03-07", "2026-03-08", "2026-03-09"]) {
			const iso = wallClockInZoneToIso(dateKey, 13 * 60, "America/New_York");
			expect({
				dateKey,
				minutes: minutesSinceMidnightInZone(iso, "America/New_York"),
			}).toEqual({ dateKey, minutes: 13 * 60 });
		}
	});

	it("handles local midnight (minute 0) without slipping to the previous day", () => {
		const iso = wallClockInZoneToIso("2026-03-10", 0, "Asia/Dubai");

		expect(dateKeyInZone(iso, "Asia/Dubai")).toBe("2026-03-10");
		expect(minutesSinceMidnightInZone(iso, "Asia/Dubai")).toBe(0);
	});
});

describe("date-key calendar math", () => {
	it("steps across month, year and leap-day boundaries", () => {
		expect(addDaysToDateKey("2026-01-31", 1)).toBe("2026-02-01");
		expect(addDaysToDateKey("2026-12-31", 1)).toBe("2027-01-01");
		expect(addDaysToDateKey("2028-02-28", 1)).toBe("2028-02-29");
		expect(addDaysToDateKey("2026-03-01", -1)).toBe("2026-02-28");
	});

	it("does not drift across DST dates (pure integer arithmetic)", () => {
		expect(addDaysToDateKey("2026-03-08", 1)).toBe("2026-03-09");
		expect(addDaysToDateKey("2026-10-25", 1)).toBe("2026-10-26");
	});

	it("maps date keys to the right weekday", () => {
		// 2026-03-08 is a Sunday.
		expect(weekdayOfDateKey("2026-03-08")).toBe(0);
		expect(weekdayOfDateKey("2026-03-14")).toBe(6);
	});

	it("snaps a week to the Sunday on or before the given day", () => {
		expect(startOfWeekKey("2026-03-11")).toBe("2026-03-08"); // Wednesday -> Sunday
		expect(startOfWeekKey("2026-03-08")).toBe("2026-03-08"); // already Sunday
		expect(startOfWeekKey("2026-03-14")).toBe("2026-03-08"); // Saturday -> same week
		expect(startOfWeekKey("2026-03-15")).toBe("2026-03-15"); // next Sunday
	});

	it("keeps a week exactly 7 days long", () => {
		expect(addDaysToDateKey(startOfWeekKey("2026-03-11"), 7)).toBe(
			startOfWeekKey("2026-03-18"),
		);
	});
});

describe("snapTo15", () => {
	it("rounds a dragged position to the nearest quarter hour", () => {
		expect(snapTo15(0)).toBe(0);
		expect(snapTo15(7)).toBe(0);
		expect(snapTo15(8)).toBe(15);
		expect(snapTo15(22)).toBe(15);
		expect(snapTo15(23)).toBe(30);
		expect(snapTo15(600)).toBe(600);
	});
});
