import { describe, expect, it } from "vitest";
import {
	availablePayoutActions,
	breakdownReconciles,
	buildPayoutBreakdown,
	canAdjustDraft,
	moneyHasLeft,
	payoutStateNotice,
	payoutVendorName,
	payRailLabel,
	railRequiresStripeAccount,
	signedAedToFils,
	vendorBlockedByMissingBankAccount,
	voidErrorMessage,
} from "./payout-actions.helpers";

describe("moneyHasLeft", () => {
	it("is true only for a non-empty gateway reference", () => {
		expect(
			moneyHasLeft({
				status: "processing",
				gateway_reference: "tr_1",
				payout_rail: "stripe_connect",
			}),
		).toBe(true);
		expect(
			moneyHasLeft({
				status: "processing",
				gateway_reference: null,
				payout_rail: "stripe_connect",
			}),
		).toBe(false);
		expect(
			moneyHasLeft({
				status: "processing",
				gateway_reference: "",
				payout_rail: "stripe_connect",
			}),
		).toBe(false);
	});
});

describe("availablePayoutActions", () => {
	it("offers approve and reject on a draft", () => {
		expect(
			availablePayoutActions({
				status: "pending",
				gateway_reference: null,
				payout_rail: null,
			}),
		).toEqual(["approve", "reject"]);
	});

	it("NEVER offers Mark Failed once a transfer has been recorded (double-pay guard)", () => {
		const actions = availablePayoutActions({
			status: "processing",
			gateway_reference: "tr_success",
			payout_rail: "stripe_connect",
		});
		expect(actions).toEqual(["mark_paid"]);
		expect(actions).not.toContain("mark_failed");
	});

	it("offers Mark Failed on a processing payout with no transfer (genuinely stuck)", () => {
		expect(
			availablePayoutActions({
				status: "processing",
				gateway_reference: null,
				payout_rail: "stripe_connect",
			}),
		).toEqual(["mark_paid", "mark_failed"]);
	});

	it("offers retry and void on a failed stripe-rail payout with no transfer", () => {
		expect(
			availablePayoutActions({
				status: "failed",
				gateway_reference: null,
				payout_rail: "stripe_connect",
			}),
		).toEqual(["retry", "void"]);
	});

	it("FIX 3: drops retry from a failed MANUAL-rail payout — the server hard-refuses 409 PAYOUT_RETRY_INVALID_RAIL", () => {
		const actions = availablePayoutActions({
			status: "failed",
			gateway_reference: null,
			payout_rail: "manual_bank_transfer",
		});
		expect(actions).toEqual(["void"]);
		expect(actions).not.toContain("retry");
	});

	it("offers NOTHING on a failed payout that carries a gateway reference", () => {
		expect(
			availablePayoutActions({
				status: "failed",
				gateway_reference: "tr_1",
				payout_rail: "stripe_connect",
			}),
		).toEqual([]);
	});

	it("offers nothing on a paid payout", () => {
		expect(
			availablePayoutActions({
				status: "paid",
				gateway_reference: "tr_1",
				payout_rail: "stripe_connect",
			}),
		).toEqual([]);
	});

	it("offers nothing for an unknown status rather than guessing", () => {
		expect(
			availablePayoutActions({
				status: "voided",
				gateway_reference: null,
				payout_rail: null,
			}),
		).toEqual([]);
	});

	it("there is no state in which both mark_failed and a gateway reference coexist", () => {
		for (const status of ["pending", "processing", "paid", "failed"]) {
			const actions = availablePayoutActions({
				status,
				gateway_reference: "tr_x",
				payout_rail: "stripe_connect",
			});
			expect(actions).not.toContain("mark_failed");
			expect(actions).not.toContain("retry");
			expect(actions).not.toContain("void");
		}
	});
});

describe("payoutStateNotice", () => {
	it("reads a sent-but-unconfirmed transfer as awaiting confirmation, not stuck", () => {
		const n = payoutStateNotice({
			status: "processing",
			gateway_reference: "tr_1",
			payout_rail: "stripe_connect",
		});
		expect(n?.title).toBe("Transfer sent — awaiting confirmation");
		expect(n?.tone).toBe("info");
	});

	it("warns loudly when a failed payout still carries a gateway reference", () => {
		const n = payoutStateNotice({
			status: "failed",
			gateway_reference: "tr_1",
			payout_rail: "stripe_connect",
		});
		expect(n?.tone).toBe("danger");
	});

	it("explains that a failed stripe-rail payout with no reference moved no money", () => {
		const n = payoutStateNotice({
			status: "failed",
			gateway_reference: null,
			payout_rail: "stripe_connect",
		});
		expect(n?.tone).toBe("warning");
		expect(n?.body).toContain("no money moved");
	});

	it("says nothing about a plain draft or a settled payout", () => {
		expect(
			payoutStateNotice({
				status: "pending",
				gateway_reference: null,
				payout_rail: null,
			}),
		).toBeNull();
		expect(
			payoutStateNotice({
				status: "paid",
				gateway_reference: "tr_1",
				payout_rail: "stripe_connect",
			}),
		).toBeNull();
	});

	describe("FIX 3 — manual rail", () => {
		it("does NOT claim 'no money has left the platform' for a processing manual-rail payout, and points at Mark Paid instead of a worker", () => {
			const n = payoutStateNotice({
				status: "processing",
				gateway_reference: null,
				payout_rail: "manual_bank_transfer",
			});
			expect(n?.tone).toBe("warning");
			expect(n?.body).not.toContain("no money has left the platform");
			expect(n?.body).not.toContain("worker died mid-flight");
			expect(n?.body).toContain("Mark Paid");
			expect(n?.body).not.toContain("Mark Failed is the correct escape");
		});

		it("still uses the transfer-worker wording for a processing stripe-rail payout (regression guard)", () => {
			const n = payoutStateNotice({
				status: "processing",
				gateway_reference: null,
				payout_rail: "stripe_connect",
			});
			expect(n?.body).toContain("worker died mid-flight");
		});

		it("does not assume a transfer worker for a failed manual-rail payout, and points at Void only", () => {
			const n = payoutStateNotice({
				status: "failed",
				gateway_reference: null,
				payout_rail: "manual_bank_transfer",
			});
			expect(n?.tone).toBe("warning");
			expect(n?.body).not.toContain("Retry to attempt the transfer again");
			expect(n?.body).toContain("Void");
		});
	});
});

describe("buildPayoutBreakdown", () => {
	// Figures modelled on computePayoutTotals: one item of 10,500 fils gross
	// (10,000 ex-VAT), 10% commission = 1,000, tax on commission 50, so
	// vendor_earning = 8,950. Shipping contribution 500, adjustments -250,
	// carrier cost 700 (informational).
	const payout = {
		gross_amount: 10_500,
		commission_total: 1_000,
		adjustment_total: -250,
		carrier_cost_total: 700,
		shipping_contribution_total: 500,
		net_amount: 8_200, // 8950 - 500 - 250
	};

	it("reconciles: the line rows sum exactly to the displayed net", () => {
		const rows = buildPayoutBreakdown(payout);
		expect(breakdownReconciles(rows)).toBe(true);
	});

	it("derives vendor earnings from the stored identity, not gross - commission", () => {
		const rows = buildPayoutBreakdown(payout);
		const earnings = rows.find((r) => r.label === "Vendor earnings");
		expect(earnings?.value).toBe(8_950);
		// gross - commission would be 9,500 — the VAT wedge is real.
		expect(earnings?.value).not.toBe(
			payout.gross_amount - payout.commission_total,
		);
	});

	it("surfaces the VAT + commission-tax wedge that used to be invisible", () => {
		const rows = buildPayoutBreakdown(payout);
		const vat = rows.find((r) => r.label === "VAT + tax on commission");
		expect(vat?.value).toBe(-550); // 500 VAT + 50 tax on commission
	});

	it("shows the shipping figure that is actually deducted", () => {
		const rows = buildPayoutBreakdown(payout);
		const shipping = rows.find((r) => r.label === "Shipping contribution");
		expect(shipping?.value).toBe(-500);
	});

	it("marks carrier cost informational and excludes it from the sum", () => {
		const rows = buildPayoutBreakdown(payout);
		const carrier = rows.find((r) => r.label === "Carrier cost");
		expect(carrier?.kind).toBe("informational");
		expect(carrier?.value).toBe(700);
		expect(breakdownReconciles(rows)).toBe(true);
	});

	it("reconciles for an all-zero payout", () => {
		expect(
			breakdownReconciles(
				buildPayoutBreakdown({
					gross_amount: 0,
					commission_total: 0,
					adjustment_total: 0,
					carrier_cost_total: 0,
					shipping_contribution_total: 0,
					net_amount: 0,
				}),
			),
		).toBe(true);
	});

	it("reconciles with a positive adjustment and no shipping", () => {
		expect(
			breakdownReconciles(
				buildPayoutBreakdown({
					gross_amount: 21_000,
					commission_total: 2_000,
					adjustment_total: 5_000,
					carrier_cost_total: 0,
					shipping_contribution_total: 0,
					net_amount: 22_900,
				}),
			),
		).toBe(true);
	});

	it("keeps every figure an integer (no float arithmetic on money)", () => {
		for (const row of buildPayoutBreakdown(payout)) {
			expect(Number.isInteger(row.value)).toBe(true);
		}
	});
});

describe("payoutVendorName", () => {
	it("uses the flat vendor_name when the list endpoint supplied one", () => {
		expect(payoutVendorName({ vendor_name: "Acme" })).toBe("Acme");
	});

	it("falls back to the loaded relation on the detail response", () => {
		expect(
			payoutVendorName({ vendor: { business_name: "Acme Trading" } }),
		).toBe("Acme Trading");
		expect(payoutVendorName({ vendor: { name: "Acme" } })).toBe("Acme");
	});

	it("never renders undefined on the screen that authorises a transfer", () => {
		expect(payoutVendorName({})).toBe("this vendor");
		expect(payoutVendorName({ vendor: null })).toBe("this vendor");
		expect(payoutVendorName({ vendor_name: "—" })).toBe("this vendor");
		expect(payoutVendorName({ vendor_name: "   " })).toBe("this vendor");
	});
});

describe("voidErrorMessage", () => {
	it("explains a 409 PAYOUT_NOT_VOIDABLE using the server's own message", () => {
		expect(
			voidErrorMessage({
				response: {
					status: 409,
					data: { code: "PAYOUT_NOT_VOIDABLE", message: "Payout is not failed" },
				},
			}),
		).toBe("Payout is not failed");
	});

	it("falls back to an explanatory message when a 409 carries none", () => {
		const msg = voidErrorMessage({
			response: { status: 409, data: { code: "PAYOUT_NOT_VOIDABLE" } },
		});
		expect(msg).toContain("no gateway reference");
	});

	it("reads a 404 as not-found", () => {
		expect(voidErrorMessage({ response: { status: 404, data: {} } })).toContain(
			"no longer exists",
		);
	});

	it("degrades to a generic message for anything else", () => {
		expect(voidErrorMessage(new Error("boom"))).toBe("Failed to void payout");
	});
});

describe("railRequiresStripeAccount", () => {
	it("is true only for the stripe rail", () => {
		expect(railRequiresStripeAccount("stripe_connect")).toBe(true);
		expect(railRequiresStripeAccount("manual_bank_transfer")).toBe(false);
	});
});

describe("payRailLabel", () => {
	it("names both rails", () => {
		expect(payRailLabel("manual_bank_transfer")).toBe("Manual bank transfer");
		expect(payRailLabel("stripe_connect")).toBe("Stripe Connect transfer");
	});
});

describe("canAdjustDraft", () => {
	it("allows adjusting only a pending draft", () => {
		expect(
			canAdjustDraft({ status: "pending", gateway_reference: null, payout_rail: null }),
		).toBe(true);
		expect(
			canAdjustDraft({
				status: "processing",
				gateway_reference: null,
				payout_rail: "stripe_connect",
			}),
		).toBe(false);
		expect(
			canAdjustDraft({
				status: "paid",
				gateway_reference: "tr_1",
				payout_rail: "stripe_connect",
			}),
		).toBe(false);
		expect(
			canAdjustDraft({
				status: "failed",
				gateway_reference: null,
				payout_rail: "stripe_connect",
			}),
		).toBe(false);
	});

	it("is false for a processing payout even with no gateway reference yet", () => {
		// A payout mid-transfer has already claimed to be paid; adjusting its
		// figures now would change net_amount out from under a transfer that's
		// already in flight or awaiting confirmation.
		expect(
			canAdjustDraft({
				status: "processing",
				gateway_reference: null,
				payout_rail: "manual_bank_transfer",
			}),
		).toBe(false);
	});

	it("is false once a gateway reference exists, regardless of status", () => {
		expect(
			canAdjustDraft({
				status: "paid",
				gateway_reference: "tr_9",
				payout_rail: "stripe_connect",
			}),
		).toBe(false);
	});
});

describe("signedAedToFils", () => {
	it("converts 12.34 AED to exactly 1234 fils, not 1233 (float-drift guard)", () => {
		// 12.34 * 100 === 1233.9999999999998 in IEEE754 — a bare multiply would
		// silently drop a fil, which becomes a reconciliation failure later.
		expect(signedAedToFils("12.34")).toBe(1234);
		expect(Number.isInteger(signedAedToFils("12.34"))).toBe(true);
	});

	it("preserves sign for a clawback typed directly as a negative amount", () => {
		expect(signedAedToFils("-25.00")).toBe(-2500);
		expect(signedAedToFils("-12.34")).toBe(-1234);
	});

	it("returns 0 for empty, whitespace or unparsable input", () => {
		expect(signedAedToFils("")).toBe(0);
		expect(signedAedToFils("   ")).toBe(0);
		expect(signedAedToFils("abc")).toBe(0);
	});

	it("rounds rather than truncates on more than 2 decimal places", () => {
		expect(signedAedToFils("12.346")).toBe(1235);
		expect(signedAedToFils("-12.346")).toBe(-1235);
	});

	it("treats a bare zero as zero, not NaN or null", () => {
		expect(signedAedToFils("0")).toBe(0);
		expect(signedAedToFils("0.00")).toBe(0);
	});
});

describe("vendorBlockedByMissingBankAccount", () => {
	it("blocks only when the server explicitly says there is no primary account", () => {
		expect(
			vendorBlockedByMissingBankAccount({ has_primary_bank_account: false }),
		).toBe(true);
		expect(
			vendorBlockedByMissingBankAccount({ has_primary_bank_account: true }),
		).toBe(false);
	});

	it("does not block on a missing field", () => {
		// undefined = the estimate has not resolved yet, or the API predates the
		// field. Reading either as \"blocked\" would flash the warning on every
		// vendor selection and permanently disable Generate against an older API.
		expect(vendorBlockedByMissingBankAccount({})).toBe(false);
		expect(
			vendorBlockedByMissingBankAccount({ has_primary_bank_account: undefined }),
		).toBe(false);
	});
});
