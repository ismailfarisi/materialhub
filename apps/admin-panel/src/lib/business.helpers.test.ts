import { describe, expect, it } from "vitest";
import {
	apiErrorMessage,
	daysUntil,
	filsToAedInput,
	isTrnFormatValid,
	netTermsActions,
	parseCreditLimitInput,
	receivableStatusLabel,
	sortForReview,
	termsLabel,
	todayInDubai,
	unwrapList,
	validateTrnInput,
} from "./business.helpers";
import { formatAedGrouped } from "./money";

describe("TRN validation", () => {
	it("accepts exactly 15 digits", () => {
		expect(isTrnFormatValid("100234567800003")).toBe(true);
	});
	it("tolerates spaces and dashes pasted from a certificate", () => {
		expect(isTrnFormatValid("100-2345-6780-0003")).toBe(true);
		expect(isTrnFormatValid("100 234 567 800 003")).toBe(true);
	});
	it("rejects short, long, lettered and empty values", () => {
		expect(isTrnFormatValid("10023456780000")).toBe(false);
		expect(isTrnFormatValid("1002345678000031")).toBe(false);
		expect(isTrnFormatValid("10023456780000A")).toBe(false);
		expect(isTrnFormatValid("")).toBe(false);
		expect(isTrnFormatValid(null)).toBe(false);
	});
	it("validateTrnInput maps empty to null and explains bad lengths", () => {
		expect(validateTrnInput("  ")).toEqual({ ok: true, value: null });
		expect(validateTrnInput("100 234 567 800 003")).toEqual({
			ok: true,
			value: "100234567800003",
		});
		expect(validateTrnInput("12345")).toEqual({
			ok: false,
			error: "A TRN has 15 digits; this has 5.",
		});
		expect(validateTrnInput("TRN100234567800003").ok).toBe(false);
	});
});

describe("credit limit input (AED → fils)", () => {
	it("converts whole and decimal AED to integer fils", () => {
		expect(parseCreditLimitInput("25000")).toEqual({
			ok: true,
			fils: 2_500_000,
		});
		expect(parseCreditLimitInput("50,000.50")).toEqual({
			ok: true,
			fils: 5_000_050,
		});
		// Float trap: 0.29 * 100 = 28.999999999999996
		expect(parseCreditLimitInput("1000.29")).toEqual({
			ok: true,
			fils: 100_029,
		});
	});
	it("rejects empty, zero, negative and over-precise values", () => {
		expect(parseCreditLimitInput("").ok).toBe(false);
		expect(parseCreditLimitInput("0").ok).toBe(false);
		expect(parseCreditLimitInput("-100").ok).toBe(false);
		expect(parseCreditLimitInput("100.123").ok).toBe(false);
		expect(parseCreditLimitInput("1e5").ok).toBe(false);
	});
	it("round-trips fils back to the input value", () => {
		expect(filsToAedInput(2_500_000)).toBe("25000");
		expect(filsToAedInput(5_000_050)).toBe("50000.50");
		expect(filsToAedInput(null)).toBe("");
	});
});

describe("money display", () => {
	it("groups thousands with 2 decimals", () => {
		expect(formatAedGrouped(1_234_500)).toBe("AED 12,345.00");
		expect(formatAedGrouped(5)).toBe("AED 0.05");
		expect(formatAedGrouped(-15_000)).toBe("−AED 150.00");
		expect(formatAedGrouped(null)).toBe("—");
	});
});

describe("labels", () => {
	it("names payment terms", () => {
		expect(termsLabel("net_30")).toBe("Net 30");
		expect(termsLabel("net_60")).toBe("Net 60");
		expect(termsLabel(null)).toBe("—");
	});
	it("labels receivable states, with days overdue", () => {
		expect(receivableStatusLabel({ status: "due", days_overdue: 0 })).toBe(
			"Due",
		);
		expect(receivableStatusLabel({ status: "paid", days_overdue: 0 })).toBe(
			"Paid",
		);
		expect(receivableStatusLabel({ status: "overdue", days_overdue: 1 })).toBe(
			"Overdue 1 day",
		);
		expect(receivableStatusLabel({ status: "overdue", days_overdue: 12 })).toBe(
			"Overdue 12 days",
		);
		// A row flagged overdue on its due date still reads as at least 1 day.
		expect(receivableStatusLabel({ status: "overdue", days_overdue: 0 })).toBe(
			"Overdue 1 day",
		);
	});
	it("counts calendar days to a due date", () => {
		const now = new Date("2026-11-06T20:00:00Z");
		expect(daysUntil("2026-11-16T08:00:00Z", now)).toBe(10);
		expect(daysUntil("2026-11-01T00:00:00Z", now)).toBe(-5);
	});
	it("gives today's date in Dubai", () => {
		// 22:30 UTC is already the next day in Dubai (UTC+4).
		expect(todayInDubai(new Date("2026-11-06T22:30:00Z"))).toBe("2026-11-07");
	});
});

describe("net-terms actions", () => {
	it("only offers approve once the business is verified", () => {
		expect(netTermsActions("applied", true)).toEqual(["approve", "reject"]);
		expect(netTermsActions("applied", false)).toEqual(["reject"]);
	});
	it("lets an approved account be re-approved (new limit) or suspended", () => {
		expect(netTermsActions("approved", true)).toEqual(["approve", "suspend"]);
	});
	it("offers nothing without an application", () => {
		expect(netTermsActions(null, true)).toEqual([]);
	});
});

describe("review ordering", () => {
	it("puts pending verification, then net-terms applications, first; stable otherwise", () => {
		const rows = [
			{ id: "a", verification_status: "verified", credit: null },
			{
				id: "b",
				verification_status: "verified",
				credit: { status: "applied" },
			},
			{ id: "c", verification_status: "pending", credit: null },
			{ id: "d", verification_status: "rejected", credit: null },
		];
		expect(sortForReview(rows).map((r) => r.id)).toEqual(["c", "b", "a", "d"]);
	});
});

describe("unwrapList", () => {
	it("reads the contract shape { data: { items, total, summary } }", () => {
		const r = unwrapList<{ id: string }, { due_count: number }>({
			data: {
				items: [{ id: "1" }],
				total: 7,
				page: 1,
				limit: 20,
				summary: { due_count: 3 },
			},
		});
		expect(r).toEqual({
			items: [{ id: "1" }],
			total: 7,
			summary: { due_count: 3 },
		});
	});
	it("also reads the legacy { data: [], total } shape", () => {
		expect(unwrapList({ data: [{ id: "1" }], total: 4 })).toEqual({
			items: [{ id: "1" }],
			total: 4,
			summary: undefined,
		});
	});
	it("survives an empty body", () => {
		expect(unwrapList(undefined)).toEqual({
			items: [],
			total: 0,
			summary: undefined,
		});
	});
});

describe("apiErrorMessage", () => {
	it("maps known codes to plain copy, else uses the server message", () => {
		expect(
			apiErrorMessage({ response: { data: { code: "NOT_VERIFIED" } } }, "x"),
		).toBe("Verify the business before approving net terms.");
		expect(
			apiErrorMessage(
				{ response: { data: { message: "Order not on terms" } } },
				"x",
			),
		).toBe("Order not on terms");
		expect(apiErrorMessage(new Error("net"), "Could not save")).toBe(
			"Could not save",
		);
	});
});
