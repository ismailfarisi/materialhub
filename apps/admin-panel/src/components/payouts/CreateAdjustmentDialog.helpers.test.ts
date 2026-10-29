import { describe, expect, test } from "vitest";
import { toSignedAdjustmentFils } from "./CreateAdjustmentDialog.helpers";

describe("toSignedAdjustmentFils", () => {
	test("a clawback of AED 50.00 produces exactly -5000", () => {
		expect(toSignedAdjustmentFils("50.00", "clawback")).toBe(-5000);
	});

	test("a credit of AED 50.00 produces exactly +5000", () => {
		expect(toSignedAdjustmentFils("50.00", "credit")).toBe(5000);
	});

	test("a fractional input like AED 12.34 produces an exact integer, no float drift", () => {
		const credit = toSignedAdjustmentFils("12.34", "credit");
		const clawback = toSignedAdjustmentFils("12.34", "clawback");
		expect(credit).toBe(1234);
		expect(Number.isInteger(credit)).toBe(true);
		expect(clawback).toBe(-1234);
		expect(Number.isInteger(clawback)).toBe(true);
	});

	test("more than 2 decimal places rounds rather than truncating", () => {
		// 12.345 * 100 = 1234.4999999999998 in floating point; Math.round
		// must still land on a whole number of fils, not 1234.4999999999998
		// or a truncated 1234.
		const result = toSignedAdjustmentFils("12.345", "credit");
		expect(Number.isInteger(result)).toBe(true);
		expect(result).toBe(Math.round(12.345 * 100));

		// An unambiguous round-up case.
		expect(toSignedAdjustmentFils("12.346", "credit")).toBe(1235);
	});

	test("zero is rejected (returns null), matching the API's rejection of zero-amount adjustments", () => {
		expect(toSignedAdjustmentFils("0", "credit")).toBeNull();
		expect(toSignedAdjustmentFils("0.00", "clawback")).toBeNull();
	});

	test("negative amount input is rejected regardless of direction", () => {
		expect(toSignedAdjustmentFils("-50", "credit")).toBeNull();
		expect(toSignedAdjustmentFils("-50", "clawback")).toBeNull();
	});

	test("empty or unparsable amount is rejected", () => {
		expect(toSignedAdjustmentFils("", "credit")).toBeNull();
		expect(toSignedAdjustmentFils("abc", "credit")).toBeNull();
	});

	test("missing direction is rejected even with a valid amount", () => {
		expect(toSignedAdjustmentFils("50.00", null)).toBeNull();
	});
});
