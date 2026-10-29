import { describe, expect, it } from "vitest";
import {
	SUPPORTED_PAYOUT_SCHEDULES,
	isUnpaidPayoutSchedule,
	payoutScheduleOptions,
	unpaidScheduleWarning,
} from "./payout-schedule.helpers";

describe("SUPPORTED_PAYOUT_SCHEDULES", () => {
	// Round 4 landed two fixes for the same defect from opposite directions:
	// the UI dropped "daily" while the backend implemented it. The backend is
	// the source of truth — `closedPeriodFor` now returns a real period for
	// daily — so the option is legitimate and this list must match that
	// function exactly.
	it("lists exactly the schedules closedPeriodFor() handles", () => {
		expect(SUPPORTED_PAYOUT_SCHEDULES.map((o) => o.value)).toEqual([
			"daily",
			"weekly",
			"biweekly",
			"monthly",
		]);
	});
});

describe("isUnpaidPayoutSchedule", () => {
	it("is true for a value the scheduler has no period definition for", () => {
		expect(isUnpaidPayoutSchedule("hourly")).toBe(true);
		expect(isUnpaidPayoutSchedule("fortnightly")).toBe(true);
	});

	it("is false for the handled schedules, daily included", () => {
		expect(isUnpaidPayoutSchedule("daily")).toBe(false);
		expect(isUnpaidPayoutSchedule("weekly")).toBe(false);
		expect(isUnpaidPayoutSchedule("biweekly")).toBe(false);
		expect(isUnpaidPayoutSchedule("monthly")).toBe(false);
	});

	it("treats an absent value as nothing to warn about (form not loaded yet)", () => {
		expect(isUnpaidPayoutSchedule(undefined)).toBe(false);
		expect(isUnpaidPayoutSchedule(null)).toBe(false);
		expect(isUnpaidPayoutSchedule("")).toBe(false);
	});
});

describe("payoutScheduleOptions", () => {
	it("offers only supported schedules for a normal vendor", () => {
		expect(payoutScheduleOptions("monthly")).toEqual(
			SUPPORTED_PAYOUT_SCHEDULES,
		);
	});

	// The column is an unconstrained varchar(50) with no CHECK, so a value the
	// scheduler cannot pay can already exist in the database.
	it("keeps an unpayable vendor's own value visible and flagged, so a save cannot silently re-point them", () => {
		const options = payoutScheduleOptions("hourly");
		expect(options[0]).toEqual({
			label: "hourly — never paid automatically",
			value: "hourly",
		});
		expect(options).toHaveLength(SUPPORTED_PAYOUT_SCHEDULES.length + 1);
	});
});

describe("unpaidScheduleWarning", () => {
	it("names the schedule and says the vendor is never paid automatically", () => {
		const msg = unpaidScheduleWarning("hourly");
		expect(msg).toContain('"hourly"');
		expect(msg).toContain("never be paid automatically");
	});

	it("is silent for a supported schedule", () => {
		expect(unpaidScheduleWarning("weekly")).toBeNull();
	});
});
