import { describe, expect, it } from "vitest";
import {
	PAYOUT_ACTION_LABELS,
	isAlarmAction,
	metadataEntries,
	metadataLabel,
	payoutActionLabel,
} from "./payout-timeline.helpers";

// Every `payout.*` audit action the backend writes, from
// `grep -o '"payout\.[a-z_]*"'` over backend/apps + backend/libs, plus
// payout.voided which the void endpoint adds.
const BACKEND_ACTIONS = [
	"payout.approved",
	"payout.commission_mark_paid_mismatch",
	"payout.draft_created",
	"payout.draft_creation_failed",
	"payout.draft_rejected",
	"payout.generated",
	"payout.note_added",
	"payout.queued",
	"payout.reconciliation_failed",
	"payout.retried",
	"payout.status_changed",
	"payout.stripe_transfer_failed",
	"payout.stripe_transfer_succeeded",
	"payout.voided",
];

describe("payoutActionLabel", () => {
	it("has an explicit label for every action the backend writes", () => {
		for (const action of BACKEND_ACTIONS) {
			expect(PAYOUT_ACTION_LABELS[action]).toBeTruthy();
		}
	});

	it("labels the money alarms that previously rendered as bare slugs", () => {
		expect(payoutActionLabel("payout.commission_mark_paid_mismatch")).toBe(
			"ALARM: money sent but commissions did not reconcile",
		);
		expect(payoutActionLabel("payout.reconciliation_failed")).toBe(
			"Reconciliation FAILED — transfer refused",
		);
		expect(payoutActionLabel("payout.draft_created")).toBe("Draft created");
		expect(payoutActionLabel("payout.approved")).toBe(
			"Draft approved — transfer queued",
		);
		expect(payoutActionLabel("payout.draft_rejected")).toBe(
			"Draft rejected — claims released",
		);
	});

	it("degrades an unmapped action to readable prose, never a raw slug", () => {
		expect(payoutActionLabel("payout.some_future_thing")).toBe(
			"Some future thing",
		);
		expect(payoutActionLabel("weird_action")).toBe("Weird action");
	});

	it("returns the input rather than an empty string for a degenerate slug", () => {
		expect(payoutActionLabel("payout.")).toBe("payout.");
	});
});

describe("isAlarmAction", () => {
	it("flags the four money alarms", () => {
		expect(isAlarmAction("payout.commission_mark_paid_mismatch")).toBe(true);
		expect(isAlarmAction("payout.reconciliation_failed")).toBe(true);
		expect(isAlarmAction("payout.stripe_transfer_failed")).toBe(true);
		expect(isAlarmAction("payout.draft_creation_failed")).toBe(true);
	});

	it("leaves routine events alone", () => {
		expect(isAlarmAction("payout.note_added")).toBe(false);
		expect(isAlarmAction("payout.stripe_transfer_succeeded")).toBe(false);
	});
});

describe("metadataEntries", () => {
	it("renders the reconciliation amounts the timeline used to discard", () => {
		const entries = metadataEntries({
			claimedEarningSum: 491_050,
			expectedEarningSum: 500_000,
		});
		expect(entries).toEqual([
			{
				key: "claimedEarningSum",
				label: "Claimed by commissions",
				value: "4910.50 AED",
			},
			{
				key: "expectedEarningSum",
				label: "Expected by the draft",
				value: "5000.00 AED",
			},
		]);
	});

	it("renders the mark-paid mismatch counts and the amount that was sent", () => {
		const entries = metadataEntries({
			gateway_reference: "tr_1",
			expected_commission_count: 20,
			marked_paid_count: 19,
			net_amount: 500_000,
		});
		expect(entries.map((e) => e.label)).toEqual([
			"Gateway reference",
			"Commissions expected",
			"Commissions marked paid",
			"Net amount",
		]);
		expect(entries[3]?.value).toBe("5000.00 AED");
	});

	it("renders the error string that used to be dropped entirely", () => {
		expect(metadataEntries({ error: "No such destination: acct_x" })).toEqual([
			{ key: "error", label: "Error", value: "No such destination: acct_x" },
		]);
	});

	it("suppresses `note` (rendered as body text) and drops nulls", () => {
		expect(
			metadataEntries({ note: "hello", job_id: null, reason: "wrong period" }),
		).toEqual([{ key: "reason", label: "Reason", value: "wrong period" }]);
	});

	it("handles a missing metadata blob", () => {
		expect(metadataEntries(null)).toEqual([]);
		expect(metadataEntries(undefined)).toEqual([]);
	});

	it("stringifies nested objects instead of printing [object Object]", () => {
		expect(metadataEntries({ detail: { a: 1 } })[0]?.value).toBe('{"a":1}');
	});

	it("renders booleans and numbers that are not money verbatim", () => {
		const entries = metadataEntries({ retry: true, marked_paid_count: 0 });
		expect(entries[0]?.value).toBe("true");
		expect(entries[1]?.value).toBe("0");
	});
});

describe("metadataLabel", () => {
	it("humanises unmapped camelCase and snake_case keys", () => {
		expect(metadataLabel("someNewField")).toBe("Some new field");
		expect(metadataLabel("some_new_field")).toBe("Some new field");
	});
});
