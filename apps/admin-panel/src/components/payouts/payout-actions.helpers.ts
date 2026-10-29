/**
 * Pure decision logic for the payout detail page: which admin actions are
 * legal for a given payout state, and how the money breakdown reconciles.
 *
 * Kept out of JSX so it can be unit-tested, and so the one rule that matters
 * most — "never offer an action that can send the money twice" — lives in a
 * single readable place.
 */

export type PayoutStatus = "pending" | "processing" | "paid" | "failed";

export type PayoutRail = "manual_bank_transfer" | "stripe_connect";

/**
 * FIX 3 (final review): `payout_rail` added. Two consequences of its absence
 * were live on the detail page:
 *
 *  1. `availablePayoutActions` offered Retry for ANY `failed` payout with no
 *     gateway reference — including a manual-rail one, where the server
 *     hard-refuses with 409 PAYOUT_RETRY_INVALID_RAIL. That is the client
 *     gate being LOOSER than the server's, which this file's own docblock
 *     promises never happens.
 *  2. `payoutStateNotice`'s `processing && !sent` copy asserted "no money has
 *     left the platform" as fact — true on the Stripe rail (no gateway
 *     reference yet written means no transfer succeeded) but not on the
 *     manual rail, where `processing` means an operator was told to go wire
 *     the money by hand and the absence of a gateway reference is simply
 *     "nobody has confirmed it back yet".
 */
export interface PayoutActionState {
	status: PayoutStatus | string;
	gateway_reference: string | null;
	payout_rail: PayoutRail | null;
}

export type PayoutActionKey =
	| "approve"
	| "reject"
	| "mark_paid"
	| "mark_failed"
	| "retry"
	| "void";

/**
 * The gateway reference is written only by `recordSuccessfulTransfer`, i.e.
 * only once Stripe has actually accepted a transfer. It is therefore the
 * single authoritative "money has left the platform" signal available to the
 * UI — status alone is not, because a SUCCESSFUL transfer leaves the payout
 * in `processing` until an admin confirms it.
 */
export function moneyHasLeft(payout: PayoutActionState): boolean {
	return payout.gateway_reference != null && payout.gateway_reference !== "";
}

/**
 * Which actions the UI may offer.
 *
 * `processing` splits in two:
 *   - WITH a gateway_reference — the transfer succeeded and is awaiting an
 *     operator's confirmation. Only Mark Paid is legal. Offering Mark Failed
 *     here is what allowed Mark Failed -> Retry to send the net_amount a
 *     second time (the retry key is deliberately fresh per operator retry, so
 *     Stripe does not dedupe it).
 *   - WITHOUT one — nothing was ever sent; this is the genuinely stuck case
 *     (worker died mid-flight) and Mark Failed is the correct escape.
 *
 * `failed` similarly splits:
 *   - WITHOUT a gateway_reference — no transfer exists, so both Retry (send
 *     it for real this time) and Void (release the claims back to the payable
 *     pool) are safe... on the Stripe rail. On the manual rail there is no
 *     transfer worker and never a Stripe call, so the server hard-refuses
 *     Retry with 409 PAYOUT_RETRY_INVALID_RAIL (see
 *     `PayoutService.retry`) — Void is the only correct escape.
 *   - WITH one — money demonstrably left. Neither retrying nor voiding is
 *     safe; the books must be corrected via Mark Paid / the adjustment ledger.
 *
 * This client gate must never be STRICTER than the server's — but it must
 * never be LOOSER either: FIX 3 (final review) was exactly that in the other
 * direction, offering Retry for a manual-rail failed payout that the server
 * always refuses.
 */
export function availablePayoutActions(
	payout: PayoutActionState,
): PayoutActionKey[] {
	const sent = moneyHasLeft(payout);
	switch (payout.status) {
		case "pending":
			return ["approve", "reject"];
		case "processing":
			return sent ? ["mark_paid"] : ["mark_paid", "mark_failed"];
		case "failed":
			if (sent) return [];
			return payout.payout_rail === "manual_bank_transfer" ? ["void"] : ["retry", "void"];
		default:
			return [];
	}
}

export interface PayoutStateNotice {
	tone: "info" | "warning" | "danger";
	title: string;
	body: string;
}

/**
 * The banner that explains the state the actions above imply. Returns null
 * when the state is self-explanatory (a plain draft, a settled payout).
 */
export function payoutStateNotice(
	payout: PayoutActionState,
): PayoutStateNotice | null {
	const sent = moneyHasLeft(payout);
	const manual = payout.payout_rail === "manual_bank_transfer";
	if (payout.status === "processing" && sent) {
		return {
			tone: "info",
			title: "Transfer sent — awaiting confirmation",
			body:
				"Stripe accepted this transfer and the commissions are already marked paid. " +
				"Confirm with Mark Paid once the funds are reconciled. This payout cannot be " +
				"marked failed or retried: doing so would send the amount a second time.",
		};
	}
	// FIX 3 (final review): this branch used to read "No gateway reference has
	// been written, so no money has left the platform" unconditionally. That
	// is true on the Stripe rail (a gateway_reference is written the instant
	// the transfer succeeds) but false on the manual rail, where `processing`
	// means an operator was ASKED to wire the money by hand and a missing
	// gateway_reference just means nobody has come back with the bank
	// reference yet — not that nothing was sent. Presenting that as fact on
	// the very screen where Mark Failed -> Void releases the claims back into
	// the payable pool is how a vendor gets paid twice.
	if (payout.status === "processing" && !sent && manual) {
		return {
			tone: "warning",
			title: "Awaiting manual bank transfer",
			body:
				"An operator was asked to send this amount from the banking portal. There is " +
				"no transfer worker on this rail, so the absence of a gateway reference does " +
				"NOT mean nothing was sent — it only means nobody has confirmed it yet. If the " +
				"money has already been wired, use Mark Paid with the bank reference. Do not " +
				"use Mark Failed: it releases the claimed commissions back into the payable " +
				"pool, and the vendor would be paid twice if the transfer already went out.",
		};
	}
	if (payout.status === "processing" && !sent) {
		return {
			tone: "warning",
			title: "Queued — no transfer recorded yet",
			body:
				"No gateway reference has been written, so no money has left the platform. " +
				"If the transfer worker died mid-flight, Mark Failed is the correct escape.",
		};
	}
	if (payout.status === "failed" && sent) {
		return {
			tone: "danger",
			title: "Failed after a transfer was already recorded",
			body:
				"This payout carries a gateway reference, so money demonstrably left the " +
				"platform. Retry and Void are both disabled. Reconcile out of band and " +
				"correct the books via Mark Paid or the adjustment ledger.",
		};
	}
	// FIX 3: the Stripe wording below assumes a transfer WORKER that can die
	// mid-flight — there is no such thing on the manual rail, and Retry is
	// never offered for it (availablePayoutActions), so this copy must not
	// suggest it either.
	if (payout.status === "failed" && !sent && manual) {
		return {
			tone: "warning",
			title: "Failed before any bank transfer was sent",
			body:
				"This payout was marked failed before an operator sent the manual bank " +
				"transfer. There is no automated transfer to retry on this rail — Void to " +
				"release the claimed commissions and adjustments back into the payable pool.",
		};
	}
	if (payout.status === "failed" && !sent) {
		return {
			tone: "warning",
			title: "Transfer failed — nothing was sent",
			body:
				"No gateway reference exists, so no money moved. Retry to attempt the " +
				"transfer again, or Void to release the claimed commissions and adjustments " +
				"back into the payable pool.",
		};
	}
	return null;
}

export interface PayoutBreakdownRow {
	label: string;
	/** Signed fils, as it contributes to the running total. */
	value: number;
	kind: "line" | "total" | "informational";
	hint?: string;
}

export interface PayoutBreakdownInput {
	gross_amount: number;
	commission_total: number;
	adjustment_total: number;
	carrier_cost_total: number;
	shipping_contribution_total: number;
	net_amount: number;
}

/**
 * Rebuilds the ledger that `computePayoutTotals` actually applied, from the
 * figures stored on the payout row, so the displayed rows sum to the displayed
 * Net.
 *
 * The backend formula (payout.service.ts computePayoutTotals) is:
 *
 *   net_amount = items_net - shipping_contribution_total - license_spend_total
 *                + adjustment_sum
 *   adjustment_total(stored) = adjustment_sum - license_spend_total
 *
 * therefore
 *
 *   net_amount = items_net - shipping_contribution_total + adjustment_total
 *   items_net  = net_amount + shipping_contribution_total - adjustment_total
 *
 * where items_net is the sum of commission.vendor_earning, i.e.
 * netExVat - commission_amount - tax_on_commission per item.
 *
 * `items_net` is NOT stored on the payout row, so it is derived from the
 * identity above rather than assumed to equal gross - commission (it does not:
 * VAT and the 5% tax on commission are both deducted before it).
 *
 * That VAT + commission-tax wedge is likewise not stored; it is recovered as
 * the residual `gross - commission - items_net`, which is exact because every
 * figure involved is integer fils.
 *
 * `carrier_cost_total` is informational ONLY — the real shipping deduction is
 * `shipping_contribution_total`. It is rendered as such, outside the sum.
 * It is the platform's *configured reference rate* (shipping.base_carrier_cost_fils),
 * frozen at each shipment's creation — not a reconciled carrier invoice, because
 * the carrier's own billed figure is unavailable. Do not describe it as "what
 * the carrier charged".
 */
export function buildPayoutBreakdown(
	payout: PayoutBreakdownInput,
): PayoutBreakdownRow[] {
	const itemsNet =
		payout.net_amount +
		payout.shipping_contribution_total -
		payout.adjustment_total;
	const vatAndCommissionTax =
		payout.gross_amount - payout.commission_total - itemsNet;

	return [
		{
			label: "Gross (customer paid, VAT incl.)",
			value: payout.gross_amount,
			kind: "line",
		},
		{
			label: "Platform commission",
			value: -payout.commission_total,
			kind: "line",
		},
		{
			label: "VAT + tax on commission",
			value: -vatAndCommissionTax,
			kind: "line",
			hint: "VAT extracted from the item total plus 5% VAT on the commission. Derived — not stored on the payout row.",
		},
		{
			label: "Vendor earnings",
			value: itemsNet,
			kind: "total",
		},
		{
			label: "Shipping contribution",
			value: -payout.shipping_contribution_total,
			kind: "line",
			hint: "The shipping cost actually deducted from the vendor.",
		},
		{
			label: "Adjustments (incl. licence spend)",
			value: payout.adjustment_total,
			kind: "line",
			hint: "Signed. Negative = clawback or reel licence spend settled against this payout.",
		},
		{ label: "Net payout", value: payout.net_amount, kind: "total" },
		{
			label: "Carrier cost",
			value: payout.carrier_cost_total,
			kind: "informational",
			hint: "The configured base carrier rate (shipping.base_carrier_cost_fils) × shipments in this period, frozen at each shipment's creation. A reference figure, not a carrier invoice. Informational only — NOT deducted from this payout.",
		},
	];
}

/**
 * Maps POST /admin/payouts/:id/void failures onto something an operator can
 * act on. A 409 / PAYOUT_NOT_VOIDABLE means the payout moved under us (or has
 * since acquired a gateway reference), which is a reload-and-look-again
 * situation, not a retry-the-same-thing one.
 */
export function voidErrorMessage(err: unknown): string {
	const res = (
		err as {
			response?: {
				status?: number;
				data?: { message?: string; code?: string };
			};
		}
	)?.response;
	const code = res?.data?.code;
	if (res?.status === 404) {
		return "This payout no longer exists. It may already have been voided or rejected — reload the payouts list.";
	}
	if (res?.status === 409 || code === "PAYOUT_NOT_VOIDABLE") {
		return (
			res?.data?.message ??
			"This payout can no longer be voided. Only a failed payout with no gateway reference may be voided — if a transfer has since been recorded, the money left the platform and the claims must stay held. Reload the page to see its current state."
		);
	}
	return res?.data?.message ?? "Failed to void payout";
}

/**
 * Resolves a displayable vendor name.
 *
 * `GET /admin/payouts/:id` returns the raw `VendorPayout` entity with its
 * `vendor` relation loaded — it does NOT carry the flat `vendor_name` that
 * `listForAdmin` maps on. Reading `payout.vendor_name` on the detail page is
 * how the approve dialog came to read "transfer of AED X to undefined" on the
 * screen that authorises a real transfer.
 *
 * Order matches the backend's own mapping in `listForAdmin`:
 * `vendor.business_name ?? vendor.name ?? "—"`.
 */
export function payoutVendorName(payout: {
	vendor_name?: string | null;
	vendor?: { business_name?: string | null; name?: string | null } | null;
}): string {
	const candidates = [
		payout.vendor_name,
		payout.vendor?.business_name,
		payout.vendor?.name,
	];
	for (const c of candidates) {
		if (typeof c === "string" && c.trim() && c !== "—") return c;
	}
	return "this vendor";
}

/**
 * The reconciling rows (everything except the informational ones) must sum to
 * the Net. Exposed so the page can assert it and the tests can prove it.
 */
export function breakdownReconciles(rows: PayoutBreakdownRow[]): boolean {
	const net = rows.find((r) => r.label === "Net payout");
	if (!net) return false;
	const sum = rows
		.filter((r) => r.kind === "line")
		.reduce((s, r) => s + r.value, 0);
	return sum === net.value;
}

/**
 * The backend refuses the Stripe rail when the vendor has no connected
 * account. The dialog mirrors that rather than letting the request 400 —
 * but it must mirror it EXACTLY: a client gate stricter than the server's is
 * how a working payout path becomes invisible to the operator.
 */
export function railRequiresStripeAccount(rail: PayoutRail): boolean {
	return rail === "stripe_connect";
}

export function payRailLabel(rail: PayoutRail): string {
	return rail === "manual_bank_transfer"
		? "Manual bank transfer"
		: "Stripe Connect transfer";
}

/**
 * Is the Generate dialog looking at a vendor the server will refuse to draft
 * for, because it has no primary bank account?
 *
 * `createDraft` stamps `vendor_payouts.bank_account_id`, which is NOT NULL, so
 * this is a hard precondition — not a warning. Mirrored client-side only to
 * make it visible BEFORE submitting; the server still enforces it.
 *
 * The distinction that matters: `undefined` means "the estimate has not come
 * back yet" (or an older API build that predates the field), and must NOT be
 * read as blocked. Treating it as blocked flashes a scary red panel on every
 * vendor selection, and permanently disables Generate against an API that
 * simply doesn't send the field.
 */
export function vendorBlockedByMissingBankAccount(estimate: {
	has_primary_bank_account?: boolean;
}): boolean {
	return estimate.has_primary_bank_account === false;
}

/**
 * Mirrors addDraftAdjustment's server-side guard: a draft's figures may only
 * be changed while nothing has claimed them for payment.
 */
export function canAdjustDraft(payout: PayoutActionState): boolean {
	return payout.status === "pending";
}

/**
 * The one AED -> signed-fils boundary crossing for AdjustDraftDialog. Unlike
 * CreateAdjustmentDialog's toSignedAdjustmentFils, the sign here comes
 * straight from the typed string ("-25.00" claws back) rather than a
 * separate direction toggle, so parseAedInput (which rejects negatives)
 * cannot be reused.
 *
 * Rounded rather than truncated: 12.34 * 100 is 1233.9999999999998 in
 * IEEE754, and a silent one-fil drift in a payout is a reconciliation
 * failure later. Unparsable or blank input yields 0 (i.e. "no adjustment"),
 * matching the disabled-submit state in the dialog rather than throwing.
 */
export function signedAedToFils(amountAed: string): number {
	const parsed = Number.parseFloat(amountAed);
	return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}
