import { describe, expect, it } from "bun:test";
import {
	addDays,
	aedToFils,
	dubaiToday,
	filsToAed,
	respondSchema,
} from "./quote-helpers";

describe("aedToFils", () => {
	it("converts AED strings to integer fils", () => {
		expect(aedToFils("3.65")).toBe(365);
		expect(aedToFils("3,6")).toBe(360);
		expect(aedToFils("25")).toBe(2500);
		expect(aedToFils(" 0.05 ")).toBe(5);
	});

	it("rejects zero, negatives, more than two decimals and junk", () => {
		expect(aedToFils("0")).toBeNull();
		expect(aedToFils("-1")).toBeNull();
		expect(aedToFils("3.655")).toBeNull();
		expect(aedToFils("AED 3")).toBeNull();
		expect(aedToFils("")).toBeNull();
	});

	it("round-trips for display", () => {
		expect(filsToAed(365)).toBe("3.65");
	});
});

describe("dates", () => {
	it("uses the Dubai calendar", () => {
		expect(dubaiToday(new Date("2026-11-06T21:30:00Z"))).toBe("2026-11-07");
		expect(addDays("2026-11-28", 5)).toBe("2026-12-03");
	});
});

describe("respondSchema", () => {
	const now = new Date("2026-11-06T06:00:00Z");
	const valid = {
		product_id: "11111111-1111-4111-8111-111111111111",
		unit_price: "3.65",
		moq: "500",
		lead_time_days: "5",
		valid_until: "2026-11-20",
	};

	it("accepts a complete response", () => {
		expect(respondSchema(now).safeParse(valid).success).toBe(true);
	});

	it("rejects a validity date in the past", () => {
		const r = respondSchema(now).safeParse({
			...valid,
			valid_until: "2026-11-05",
		});
		expect(r.success).toBe(false);
	});

	it("requires a listing and a sensible price", () => {
		expect(
			respondSchema(now).safeParse({ ...valid, product_id: "" }).success,
		).toBe(false);
		expect(
			respondSchema(now).safeParse({ ...valid, unit_price: "0" }).success,
		).toBe(false);
	});
});
