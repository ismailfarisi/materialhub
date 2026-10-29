import { describe, expect, test } from "bun:test";
import { aedToFils, filsToAed, formatAed } from "./money";

describe("filsToAed", () => {
	test("converts fils to AED string with 2 decimal places", () => {
		expect(filsToAed(10000)).toBe("100.00");
	});
	test("handles 0", () => {
		expect(filsToAed(0)).toBe("0.00");
	});
	test("rounds to 2 decimal places", () => {
		expect(filsToAed(101)).toBe("1.01");
	});
});

describe("formatAed", () => {
	test("appends AED suffix", () => {
		expect(formatAed(10000)).toBe("100.00 AED");
	});
	test("formats zero", () => {
		expect(formatAed(0)).toBe("0.00 AED");
	});
});

describe("aedToFils", () => {
	test("converts a whole-AED string to fils", () => {
		expect(aedToFils("20")).toBe(2000);
	});
	test("accepts numeric input", () => {
		expect(aedToFils(20)).toBe(2000);
	});
	test("converts fractional AED to fils", () => {
		expect(aedToFils("12.5")).toBe(1250);
	});
	test("treats 0 as a valid bound", () => {
		expect(aedToFils("0")).toBe(0);
	});
	test("returns undefined for blank input", () => {
		expect(aedToFils("")).toBeUndefined();
		expect(aedToFils(null)).toBeUndefined();
		expect(aedToFils(undefined)).toBeUndefined();
	});
	test("returns undefined for non-numeric or negative input", () => {
		expect(aedToFils("abc")).toBeUndefined();
		expect(aedToFils("-5")).toBeUndefined();
	});
});
