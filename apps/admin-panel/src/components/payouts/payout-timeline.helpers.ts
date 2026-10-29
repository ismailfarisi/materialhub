import { formatAed } from "@/lib/money";

/**
 * Human labels for every `payout.*` audit action the backend writes.
 * Verified against `grep -o '"payout\.[a-z_]*"'` over backend/apps + backend/libs.
 *
 * An action missing from this map used to render as a bare slug
 * ("payout.commission_mark_paid_mismatch"), which is how the loudest alarm on
 * the whole feature — "money has already left and the books are wrong" —
 * reached the operator. New backend actions must degrade to something
 * readable, so `payoutActionLabel` humanises the slug rather than printing it.
 */
export const PAYOUT_ACTION_LABELS: Record<string, string> = {
	"payout.queued": "Generation queued",
	"payout.generated": "Payout generated",
	"payout.draft_created": "Draft created",
	"payout.draft_creation_failed": "Draft creation FAILED",
	"payout.approved": "Draft approved — transfer queued",
	"payout.draft_rejected": "Draft rejected — claims released",
	"payout.voided": "Payout voided — claims released",
	"payout.stripe_transfer_succeeded": "Stripe transfer succeeded",
	"payout.stripe_transfer_failed": "Stripe transfer FAILED",
	"payout.reconciliation_failed": "Reconciliation FAILED — transfer refused",
	"payout.commission_mark_paid_mismatch":
		"ALARM: money sent but commissions did not reconcile",
	"payout.retried": "Retry attempted",
	"payout.status_changed": "Status changed",
	"payout.note_added": "Note added",
};

/**
 * Actions that mean "an operator needs to look at this now". Used to tint the
 * timeline entry rather than letting a money alarm read like a routine event.
 */
const ALARM_ACTIONS = new Set([
	"payout.draft_creation_failed",
	"payout.stripe_transfer_failed",
	"payout.reconciliation_failed",
	"payout.commission_mark_paid_mismatch",
]);

export function isAlarmAction(action: string): boolean {
	return ALARM_ACTIONS.has(action);
}

/**
 * Falls back to a readable rendering of an unmapped slug —
 * "payout.some_new_thing" -> "Some new thing" — so a backend action added
 * after this file was written degrades gracefully instead of leaking an
 * implementation identifier onto an operator's screen.
 */
export function payoutActionLabel(action: string): string {
	const mapped = PAYOUT_ACTION_LABELS[action];
	if (mapped) return mapped;
	const tail = action.startsWith("payout.") ? action.slice("payout.".length) : action;
	const words = tail.replace(/[._]+/g, " ").trim();
	if (!words) return action;
	return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Metadata keys carrying integer fils, rendered as AED. */
const MONEY_KEYS = new Set([
	"claimedEarningSum",
	"expectedEarningSum",
	"net_amount",
	"amount_fils",
]);

/** Keys rendered by the timeline outside the metadata list, or pure noise. */
const SUPPRESSED_KEYS = new Set(["note"]);

const METADATA_LABELS: Record<string, string> = {
	error: "Error",
	reason: "Reason",
	claimedEarningSum: "Claimed by commissions",
	expectedEarningSum: "Expected by the draft",
	marked_paid_count: "Commissions marked paid",
	expected_commission_count: "Commissions expected",
	net_amount: "Net amount",
	gateway_reference: "Gateway reference",
	job_id: "Job",
	retry_token: "Retry token",
	retry: "Retry",
	vendor_id: "Vendor",
	period_start: "Period start",
	period_end: "Period end",
	superseded_by_reversal: "Superseded by reversal",
};

export interface MetadataEntry {
	key: string;
	label: string;
	value: string;
}

export function metadataLabel(key: string): string {
	const mapped = METADATA_LABELS[key];
	if (mapped) return mapped;
	const words = key
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/[._]+/g, " ")
		.toLowerCase()
		.trim();
	return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Turns an audit row's metadata blob into displayable entries.
 *
 * Previously the timeline rendered ONLY `metadata.note`, silently discarding
 * `error`, `claimedEarningSum`, `expectedEarningSum`, `marked_paid_count` and
 * `expected_commission_count` — i.e. every number an operator needs to work
 * out what went wrong. Render what exists instead of an allowlist of one.
 *
 * `note` is excluded because the timeline renders it as body text above.
 * Nulls and undefineds are dropped; objects are JSON-stringified rather than
 * rendered as "[object Object]".
 */
export function metadataEntries(
	metadata: Record<string, unknown> | null | undefined,
): MetadataEntry[] {
	if (!metadata) return [];
	const out: MetadataEntry[] = [];
	for (const [key, raw] of Object.entries(metadata)) {
		if (SUPPRESSED_KEYS.has(key)) continue;
		if (raw == null) continue;
		let value: string;
		if (MONEY_KEYS.has(key) && typeof raw === "number") {
			value = formatAed(raw);
		} else if (typeof raw === "object") {
			value = JSON.stringify(raw);
		} else {
			value = String(raw);
		}
		out.push({ key, label: metadataLabel(key), value });
	}
	return out;
}
