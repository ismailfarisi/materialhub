import { describe, expect, it } from "vitest";
import {
	countdown,
	previewHeadline,
	sameSettings,
	setSpeed,
	speedFor,
	toggleDay,
	validate,
} from "./delivery-settings.helpers";

const base = {
	dispatch_cutoff_time: "14:00",
	handling_days: 1,
	working_days: [1, 2, 3, 4, 5],
	same_day_emirates: ["Dubai"],
	next_day_emirates: ["Sharjah"],
};

describe("delivery settings helpers", () => {
	it("keeps each emirate in one list", () => {
		const s = setSpeed(base, "Sharjah", "same_day");
		expect(s.same_day_emirates).toEqual(["Dubai", "Sharjah"]);
		expect(s.next_day_emirates).toEqual([]);
		expect(speedFor(setSpeed(s, "Dubai", "standard"), "Dubai")).toBe(
			"standard",
		);
	});

	it("toggles Friday and Saturday on and off", () => {
		const withSat = toggleDay(base, 6);
		expect(withSat.working_days).toEqual([1, 2, 3, 4, 5, 6]);
		expect(toggleDay(withSat, 5).working_days).toEqual([1, 2, 3, 4, 6]);
	});

	it("validates the form", () => {
		expect(validate(base)).toBeNull();
		expect(validate({ ...base, dispatch_cutoff_time: "25:00" })).toMatch(
			/HH:MM/,
		);
		expect(validate({ ...base, handling_days: -1 })).toMatch(/0 to 60/);
		expect(validate({ ...base, working_days: [] })).toMatch(/working day/);
	});

	it("ignores list order when checking for changes", () => {
		expect(sameSettings(base, { ...base, working_days: [5, 4, 3, 2, 1] })).toBe(
			true,
		);
		expect(sameSettings(base, { ...base, handling_days: 0 })).toBe(false);
	});

	it("words the preview like the storefront", () => {
		const now = new Date("2026-11-09T10:00:00+04:00");
		const p = { earliest: "2026-11-09", latest: "2026-11-09" } as never;
		expect(previewHeadline(p, now)).toBe("Get it today");
		expect(
			previewHeadline(
				{ earliest: "2026-11-10", latest: "2026-11-10" } as never,
				now,
			),
		).toMatch(/^Get it tomorrow/);
		expect(
			previewHeadline(
				{ earliest: "2026-11-10", latest: "2026-11-12" } as never,
				now,
			),
		).toMatch(/^Get it by Thu/);
		expect(countdown(200)).toBe("3 h 20 m");
		expect(countdown(0)).toBeNull();
		expect(countdown(2000)).toBeNull();
	});
});
