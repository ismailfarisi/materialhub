import type { AdminQuoteDetail } from "@/lib/queries/quotes";

export const REQUEST_STATUS_OPTIONS = [
	{ label: "All statuses", value: "__all__" },
	{ label: "Waiting for quotes", value: "open" },
	{ label: "Quotes in", value: "quoted" },
	{ label: "Accepted", value: "accepted" },
	{ label: "Closed (all declined)", value: "closed" },
	{ label: "Cancelled", value: "cancelled" },
];

export function aed(fils: number): string {
	return `AED ${(fils / 100).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function day(isoDate: string): string {
	const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
	return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).toLocaleDateString(
		"en-AE",
		{
			day: "2-digit",
			month: "short",
			year: "numeric",
			timeZone: "UTC",
		},
	);
}

export function buyerName(b: AdminQuoteDetail["buyer"]): string {
	if (!b) return "—";
	const name = [b.first_name, b.last_name].filter(Boolean).join(" ");
	return name ? `${name} (${b.email})` : b.email;
}

/** One line per status change, naming the supplier when it's on one supplier's side. */
export function historyLines(
	detail: AdminQuoteDetail,
): { id: string; at: string; text: string }[] {
	const names = new Map(
		detail.suppliers.map((s) => [s.id, s.vendor?.name ?? "Supplier"]),
	);
	return detail.history.map((h) => {
		const who = h.quote_request_vendor_id
			? (names.get(h.quote_request_vendor_id) ?? "Supplier")
			: "Request";
		const what =
			h.subject === "response"
				? `quote ${h.to_status}`
				: h.to_status.replace(/_/g, " ");
		const from = h.from_status
			? ` (was ${h.from_status.replace(/_/g, " ")})`
			: "";
		const note = h.note ? `: “${h.note}”` : "";
		return {
			id: h.id,
			at: h.created_at,
			text: `${who}: ${what}${from}, by ${h.actor_role}${note}`,
		};
	});
}
