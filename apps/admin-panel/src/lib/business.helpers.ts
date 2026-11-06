/**
 * Pure helpers for the business-accounts, receivables and vendor-TRN screens.
 * Contract: docs/business/business-accounts.md.
 */

import { parseAedInput } from "./money";

// ─── TRN ──────────────────────────────────────────────────────────────────

/** Strip the spaces and dashes people paste from a tax certificate. */
export function normalizeTrn(input: string): string {
	return input.replace(/[\s-]/g, "");
}

/** A UAE TRN is exactly 15 digits (format check only; the FTA is the authority). */
export function isTrnFormatValid(input: string | null | undefined): boolean {
	if (!input) return false;
	return /^\d{15}$/.test(normalizeTrn(input));
}

/**
 * Validate a TRN typed into an edit form. Empty means "no TRN" (null).
 * Returns the normalised value or an error message.
 */
export function validateTrnInput(
	input: string,
): { ok: true; value: string | null } | { ok: false; error: string } {
	const v = normalizeTrn(input.trim());
	if (v === "") return { ok: true, value: null };
	if (!/^\d+$/.test(v)) return { ok: false, error: "A TRN has digits only." };
	if (v.length !== 15)
		return {
			ok: false,
			error: `A TRN has 15 digits; this has ${v.length}.`,
		};
	return { ok: true, value: v };
}

// ─── Money input ──────────────────────────────────────────────────────────

/**
 * Parse the credit-limit field (AED, as typed) into integer fils.
 * Accepts thousands separators ("50,000.00"); rejects more than 2 decimals,
 * zero and negatives, because approving net terms needs a limit > 0.
 */
export function parseCreditLimitInput(
	input: string,
): { ok: true; fils: number } | { ok: false; error: string } {
	const cleaned = input.replace(/,/g, "").trim();
	if (cleaned === "")
		return { ok: false, error: "Enter a credit limit in AED." };
	if (!/^\d+(\.\d{1,2})?$/.test(cleaned))
		return { ok: false, error: "Use a plain amount like 25000 or 25000.50." };
	const fils = parseAedInput(cleaned);
	if (fils == null || fils <= 0)
		return { ok: false, error: "The credit limit must be more than AED 0." };
	return { ok: true, fils };
}

/** Fils → the value shown in an AED input ("25000.00" → "25000"). */
export function filsToAedInput(fils: number | null | undefined): string {
	if (fils == null) return "";
	const aed = fils / 100;
	return Number.isInteger(aed) ? String(aed) : aed.toFixed(2);
}

// ─── Labels ───────────────────────────────────────────────────────────────

export type PaymentTerms = "net_30" | "net_60";

export function termsLabel(terms: string | null | undefined): string {
	if (terms === "net_30") return "Net 30";
	if (terms === "net_60") return "Net 60";
	if (terms === "immediate") return "Immediate";
	return "—";
}

export type ReceivableStatus = "due" | "overdue" | "paid";

export function receivableStatusLabel(r: {
	status: ReceivableStatus;
	days_overdue: number;
}): string {
	if (r.status === "paid") return "Paid";
	if (r.status === "overdue") {
		const d = Math.max(1, r.days_overdue);
		return `Overdue ${d} ${d === 1 ? "day" : "days"}`;
	}
	return "Due";
}

/** Days until the due date (negative once past). Calendar days, UTC. */
export function daysUntil(iso: string, now: Date = new Date()): number {
	const due = Date.UTC(
		new Date(iso).getUTCFullYear(),
		new Date(iso).getUTCMonth(),
		new Date(iso).getUTCDate(),
	);
	const today = Date.UTC(
		now.getUTCFullYear(),
		now.getUTCMonth(),
		now.getUTCDate(),
	);
	return Math.round((due - today) / 86_400_000);
}

export type NetTermsStatus = "applied" | "approved" | "rejected" | "suspended";

/** Which net-terms decisions make sense from the current state. */
export function netTermsActions(
	status: NetTermsStatus | null | undefined,
	verified: boolean,
): Array<"approve" | "reject" | "suspend"> {
	if (!status) return [];
	switch (status) {
		case "applied":
			return verified ? ["approve", "reject"] : ["reject"];
		case "approved":
			// Re-approving lets an admin change the terms or the limit.
			return ["approve", "suspend"];
		case "suspended":
			return verified ? ["approve", "reject"] : ["reject"];
		case "rejected":
			return verified ? ["approve"] : [];
	}
}

/** Sort key: rows that need an admin first (pending verification, then a net-terms application). */
export function reviewPriority(row: {
	verification_status: string;
	credit: { status: string } | null;
}): number {
	if (row.verification_status === "pending") return 0;
	if (row.credit?.status === "applied") return 1;
	return 2;
}

/** Stable sort that floats rows needing review to the top of the current page. */
export function sortForReview<
	T extends { verification_status: string; credit: { status: string } | null },
>(rows: T[]): T[] {
	return rows
		.map((row, i) => ({ row, i }))
		.sort((a, b) => reviewPriority(a.row) - reviewPriority(b.row) || a.i - b.i)
		.map(({ row }) => row);
}

// ─── API envelope ─────────────────────────────────────────────────────────

/**
 * The contract puts `{ items, total, page, limit, summary? }` in `data`.
 * Some older admin endpoints put the array straight in `data` with `total`
 * beside it; accept both so a backend shape slip doesn't blank the page.
 */
export function unwrapList<T, S = undefined>(
	body: unknown,
): { items: T[]; total: number; summary: S | undefined } {
	const b = (body ?? {}) as {
		data?: unknown;
		total?: number;
		summary?: S;
	};
	const d = b.data as
		| { items?: T[]; total?: number; summary?: S }
		| T[]
		| undefined;
	if (Array.isArray(d))
		return { items: d, total: b.total ?? d.length, summary: b.summary };
	const items = d?.items ?? [];
	return {
		items,
		total: d?.total ?? items.length,
		summary: d?.summary ?? b.summary,
	};
}

const ERROR_COPY: Record<string, string> = {
	NOT_VERIFIED: "Verify the business before approving net terms.",
	TRN_INVALID: "The TRN must be 15 digits.",
	TRN_REQUIRED: "A VAT-registered business needs a TRN.",
	LICENCE_EXPIRED: "The trade licence has expired.",
	TERMS_ALREADY_ACTIVE: "Net terms are already active for this business.",
};

/** Turn an axios error into one line naming the problem. */
export function apiErrorMessage(err: unknown, fallback: string): string {
	const e = err as {
		response?: { data?: { code?: string; message?: string | string[] } };
	};
	const code = e?.response?.data?.code;
	if (code && ERROR_COPY[code]) return ERROR_COPY[code];
	const msg = e?.response?.data?.message;
	if (Array.isArray(msg)) return msg.join(" ");
	return msg || fallback;
}

// ─── Dates ────────────────────────────────────────────────────────────────

export function formatDate(iso: string | null | undefined): string {
	if (!iso) return "—";
	return new Date(iso).toLocaleDateString("en-AE", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

/** Today in Asia/Dubai as YYYY-MM-DD (for the paid-date input's max). */
export function todayInDubai(now: Date = new Date()): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Dubai",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(now);
}
