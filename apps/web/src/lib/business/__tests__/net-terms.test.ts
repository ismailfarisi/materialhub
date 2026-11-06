import { describe, expect, it } from "vitest";
import {
	aedInputToFils,
	apiErrorCode,
	creditMeterTone,
	creditUsedRatio,
	dueDateFor,
	isApprovalRequiredError,
	moneyParam,
	netTermsReasonKey,
} from "../net-terms";

describe("net terms helpers", () => {
	it("dates the payment 30 or 60 days out", () => {
		const from = new Date("2026-11-06T10:00:00Z");
		expect(dueDateFor("net_30", from).toISOString().slice(0, 10)).toBe(
			"2026-12-06",
		);
		expect(dueDateFor("net_60", from).toISOString().slice(0, 10)).toBe(
			"2027-01-05",
		);
	});

	it("computes the share of credit used, clamped", () => {
		expect(
			creditUsedRatio({
				credit_limit_fils: 10_000_000,
				outstanding_fils: 2_500_000,
			}),
		).toBe(0.25);
		expect(
			creditUsedRatio({ credit_limit_fils: 100, outstanding_fils: 500 }),
		).toBe(1);
		expect(
			creditUsedRatio({ credit_limit_fils: 0, outstanding_fils: 500 }),
		).toBe(0);
	});

	it("colours the meter by state: overdue is an error, ≥90% a warning", () => {
		expect(
			creditMeterTone({
				credit_limit_fils: 1000,
				outstanding_fils: 100,
				overdue_count: 0,
			}),
		).toBe("normal");
		expect(
			creditMeterTone({
				credit_limit_fils: 1000,
				outstanding_fils: 950,
				overdue_count: 0,
			}),
		).toBe("warning");
		expect(
			creditMeterTone({
				credit_limit_fils: 1000,
				outstanding_fils: 100,
				overdue_count: 1,
			}),
		).toBe("error");
	});

	it("maps the quote's reason keys into the business namespace", () => {
		expect(netTermsReasonKey("payment.net_terms.over_credit")).toBe(
			"checkout.reason.overCredit",
		);
		expect(netTermsReasonKey("payment.net_terms.overdue")).toBe(
			"checkout.reason.overdue",
		);
		expect(netTermsReasonKey("payment.net_terms.not_verified")).toBe(
			"checkout.reason.notVerified",
		);
		expect(netTermsReasonKey("payment.something_else")).toBe(
			"checkout.reason.unavailable",
		);
		expect(netTermsReasonKey(null)).toBe("checkout.reason.unavailable");
	});

	it("reads typed money params", () => {
		expect(
			moneyParam({ available: { type: "money", value: 1250000 } }, "available"),
		).toBe(1250000);
		expect(
			moneyParam({ available: "42" as unknown as number }, "available"),
		).toBeNull();
		expect(moneyParam(undefined, "available")).toBeNull();
	});

	it("recognises 403 APPROVAL_REQUIRED wherever the envelope puts the code", () => {
		expect(
			isApprovalRequiredError({
				response: { status: 403, data: { code: "APPROVAL_REQUIRED" } },
			}),
		).toBe(true);
		expect(
			isApprovalRequiredError({
				response: { status: 403, data: { error: "APPROVAL_REQUIRED" } },
			}),
		).toBe(true);
		expect(
			isApprovalRequiredError({
				response: {
					status: 403,
					data: { data: { code: "APPROVAL_REQUIRED" } },
				},
			}),
		).toBe(true);
		expect(
			isApprovalRequiredError({
				response: { status: 403, data: { code: "BUSINESS_ROLE_REQUIRED" } },
			}),
		).toBe(false);
		expect(
			isApprovalRequiredError({
				response: { status: 400, data: { code: "APPROVAL_REQUIRED" } },
			}),
		).toBe(false);
		expect(isApprovalRequiredError(new Error("network"))).toBe(false);
		expect(apiErrorCode({ response: { data: { code: "TRN_INVALID" } } })).toBe(
			"TRN_INVALID",
		);
	});

	it("turns AED input into fils", () => {
		expect(aedInputToFils("50,000")).toBe(5_000_000);
		expect(aedInputToFils("12.5")).toBe(1250);
		expect(aedInputToFils("")).toBeNull();
		expect(aedInputToFils("-1")).toBeNull();
		expect(aedInputToFils("abc")).toBeNull();
	});
});
