import { z } from "zod";

export const QUOTE_STATUS_OPTIONS = [
	{ label: "All statuses", value: "" },
	{ label: "Awaiting your quote", value: "pending" },
	{ label: "Quoted", value: "responded" },
	{ label: "Buyer declined", value: "buyer_declined" },
	{ label: "Won", value: "accepted" },
	{ label: "Not selected", value: "not_selected" },
	{ label: "You declined", value: "vendor_declined" },
	{ label: "Cancelled by buyer", value: "cancelled" },
];

export const SUPPLIER_STATUS_LABEL: Record<string, string> = Object.fromEntries(
	QUOTE_STATUS_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label]),
);

/** Colour map for the shared StatusBadge, by supplier-side status. */
export const QUOTE_STATUS_COLORS: Record<string, string> = {
	pending: "bg-caramel/10 text-caramel border border-caramel/30",
	responded: "bg-taupe/10 text-taupe border border-taupe/30",
	buyer_declined: "bg-russet/10 text-russet border border-russet/30",
	accepted: "bg-amber/10 text-amber border border-amber/30",
	not_selected: "bg-pearl/20 text-taupe border border-pearl/30",
	vendor_declined: "bg-pearl/20 text-taupe border border-pearl/30",
	cancelled: "bg-pearl/20 text-taupe border border-pearl/30",
};

/** "3.65" or "3,65" → 365 fils. Returns null for anything that isn't a positive amount with ≤ 2 decimals. */
export function aedToFils(input: string): number | null {
	const s = input.trim().replace(",", ".");
	if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
	const [whole, frac = ""] = s.split(".");
	const fils = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
	return fils > 0 ? fils : null;
}

export function filsToAed(fils: number): string {
	return (fils / 100).toLocaleString("en-AE", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
}

/** Today in Asia/Dubai, YYYY-MM-DD. */
export function dubaiToday(now: Date = new Date()): string {
	return new Date(now.getTime() + 4 * 3600_000).toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
	const d = new Date(`${isoDate}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

export function formatDay(isoDate: string): string {
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

export function respondSchema(now: Date = new Date()) {
	const today = dubaiToday(now);
	return z.object({
		product_id: z.string().uuid("Choose the listing that fulfils this quote"),
		variant_id: z.string().optional(),
		unit_price: z
			.string()
			.refine((v) => aedToFils(v) !== null, "Enter a price like 3.65"),
		moq: z.coerce.number().int("Whole units only").min(1, "At least 1"),
		lead_time_days: z.coerce
			.number()
			.int("Whole days only")
			.min(0, "Zero or more days")
			.max(365, "At most 365 days"),
		valid_until: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date")
			.refine((v) => v >= today, "Can't be in the past"),
		notes: z.string().max(2000).optional(),
	});
}

export type RespondFormValues = z.infer<ReturnType<typeof respondSchema>>;
