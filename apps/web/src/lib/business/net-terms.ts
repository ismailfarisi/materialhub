import type { ApprovalStatus, CreditAccount, NetTerms } from "./types";

export const NET_TERMS_DAYS: Record<NetTerms, number> = {
	net_30: 30,
	net_60: 60,
};

export function netTermsDays(
	terms: NetTerms | null | undefined,
): number | null {
	return terms ? NET_TERMS_DAYS[terms] : null;
}

/** Due date if the order is confirmed on `from` (the order confirms straight away). */
export function dueDateFor(terms: NetTerms, from: Date = new Date()): Date {
	const d = new Date(from.getTime());
	d.setDate(d.getDate() + NET_TERMS_DAYS[terms]);
	return d;
}

/** Share of the credit limit in use, 0..1 (clamped; 0 when there is no limit). */
export function creditUsedRatio(
	credit: Pick<CreditAccount, "credit_limit_fils" | "outstanding_fils">,
): number {
	if (!credit.credit_limit_fils || credit.credit_limit_fils <= 0) return 0;
	return Math.min(
		1,
		Math.max(0, credit.outstanding_fils / credit.credit_limit_fils),
	);
}

export type MeterTone = "normal" | "warning" | "error";

/** Overdue invoices stop "Pay on invoice" at checkout, so they read as error; ≥ 90% used as warning. */
export function creditMeterTone(
	credit: Pick<
		CreditAccount,
		"credit_limit_fils" | "outstanding_fils" | "overdue_count"
	>,
): MeterTone {
	if (credit.overdue_count > 0) return "error";
	return creditUsedRatio(credit) >= 0.9 ? "warning" : "normal";
}

/** Net-terms reason keys the quote sends, mapped to keys in the `business` namespace. */
export const NET_TERMS_REASON_KEYS = {
	"payment.net_terms.over_credit": "checkout.reason.overCredit",
	"payment.net_terms.overdue": "checkout.reason.overdue",
	"payment.net_terms.not_verified": "checkout.reason.notVerified",
} as const;

export type NetTermsReasonMessageKey =
	| (typeof NET_TERMS_REASON_KEYS)[keyof typeof NET_TERMS_REASON_KEYS]
	| "checkout.reason.unavailable";

export function netTermsReasonKey(
	reasonKey: string | null | undefined,
): NetTermsReasonMessageKey {
	return (
		(reasonKey &&
			NET_TERMS_REASON_KEYS[reasonKey as keyof typeof NET_TERMS_REASON_KEYS]) ||
		"checkout.reason.unavailable"
	);
}

/** Pull a money param (fils) out of the quote's typed reason_params. */
export function moneyParam(
	params: Record<string, unknown> | undefined,
	name: string,
): number | null {
	const p = params?.[name] as
		| { type?: string; value?: string | number }
		| number
		| null
		| undefined;
	if (p == null) return null;
	if (typeof p === "number") return p;
	const n = Number(p.value);
	return Number.isFinite(n) ? n : null;
}

/** Is this axios error the checkout's `403 APPROVAL_REQUIRED`? */
export function isApprovalRequiredError(err: unknown): boolean {
	const res = (
		err as { response?: { status?: number; data?: Record<string, unknown> } }
	)?.response;
	if (res?.status !== 403) return false;
	const d = res.data ?? {};
	const nested = (d.data ?? {}) as Record<string, unknown>;
	return [d.code, d.error, nested.code].includes("APPROVAL_REQUIRED");
}

/** The backend error code on a 4xx, wherever the envelope puts it. */
export function apiErrorCode(err: unknown): string | null {
	const d = (err as { response?: { data?: Record<string, unknown> } })?.response
		?.data;
	if (!d) return null;
	const nested = (d.data ?? {}) as Record<string, unknown>;
	const code = d.code ?? nested.code ?? d.error;
	return typeof code === "string" ? code : null;
}

export const OPEN_APPROVAL_STATUSES: ApprovalStatus[] = ["pending"];

/** AED text input → fils; null for blank or invalid. */
export function aedInputToFils(value: string): number | null {
	const cleaned = value.replace(/[,\s]/g, "");
	if (cleaned === "") return null;
	const n = Number(cleaned);
	if (!Number.isFinite(n) || n < 0) return null;
	return Math.round(n * 100);
}
