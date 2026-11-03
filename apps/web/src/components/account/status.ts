import type { Tone } from "./account-ui";

/** Order / vendor sub-order status → state tone. */
export function orderTone(status?: string | null): Tone {
	switch (status?.toLowerCase()) {
		case "delivered":
		case "partially_delivered":
			return "success";
		case "pending_payment":
		case "pending":
		case "on_hold":
			return "warning";
		case "cancelled":
		case "failed":
			return "error";
		case "refunded":
		case "partially_refunded":
		case "returned":
			return "neutral";
		default:
			return "progress";
	}
}

export function paymentTone(status?: string | null): Tone {
	switch (status?.toLowerCase()) {
		case "captured":
		case "paid":
			return "success";
		case "pending":
		case "authorized":
			return "warning";
		case "failed":
		case "chargeback":
			return "error";
		default:
			return "neutral";
	}
}

export function returnTone(status?: string | null): Tone {
	switch (status?.toLowerCase()) {
		case "refunded":
			return "success";
		case "rejected":
			return "error";
		case "approved":
			// The buyer has to ship the parcel back: their move.
			return "warning";
		default:
			return "progress";
	}
}

export function ticketTone(status?: string | null): Tone {
	switch (status?.toLowerCase()) {
		case "waiting_customer":
			return "warning";
		case "resolved":
			return "success";
		case "closed":
			return "neutral";
		default:
			return "progress";
	}
}

/** Translate a status key, falling back to a readable form of the raw key. */
export function statusLabel(t: (key: string) => string, status?: string | null): string {
	const key = status?.toLowerCase() ?? "";
	try {
		const out = t(key);
		// next-intl returns "namespace.key" when the key is missing.
		if (!out || out.endsWith(`.${key}`)) throw new Error("missing");
		return out;
	} catch {
		const plain = key.replace(/_/g, " ");
		return plain.charAt(0).toUpperCase() + plain.slice(1);
	}
}
