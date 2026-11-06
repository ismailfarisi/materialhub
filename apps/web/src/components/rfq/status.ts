import type { Tone } from "@/components/account/account-ui";
import type {
	QuoteDisplayState,
	QuoteRequestStatus,
	QuoteSupplierStatus,
} from "@/lib/queries/rfq";

export function requestTone(status: QuoteRequestStatus): Tone {
	switch (status) {
		case "quoted":
			return "progress";
		case "accepted":
			return "success";
		case "cancelled":
		case "closed":
			return "neutral";
		default:
			return "warning";
	}
}

export function supplierTone(status: QuoteSupplierStatus): Tone {
	switch (status) {
		case "responded":
			return "progress";
		case "accepted":
			return "success";
		case "vendor_declined":
		case "buyer_declined":
			return "error";
		case "pending":
			return "warning";
		default:
			return "neutral";
	}
}

export function quoteStateTone(state: QuoteDisplayState): Tone {
	switch (state) {
		case "live":
			return "success";
		case "accepted":
			return "success";
		case "expired":
		case "declined":
			return "error";
		default:
			return "neutral";
	}
}

/** A Dubai-calendar date (YYYY-MM-DD) for display, without timezone drift. */
export function formatQuoteDate(isoDate: string, locale: string): string {
	const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
	return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).toLocaleDateString(
		locale === "ar" ? "ar-AE" : "en-AE",
		{
			day: "numeric",
			month: "short",
			year: "numeric",
			timeZone: "UTC",
		},
	);
}

/** Today in Asia/Dubai as YYYY-MM-DD, for date-input minimums. */
export function dubaiTodayIso(now: Date = new Date()): string {
	return new Date(now.getTime() + 4 * 3600_000).toISOString().slice(0, 10);
}
