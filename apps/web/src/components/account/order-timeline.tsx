"use client";

import { useTranslations } from "next-intl";
import { StatusBadge } from "./account-ui";
import { StepTrack } from "./step-track";

const statuses = ["placed", "shipped", "out_for_delivery", "delivered"] as const;

// The backend carries ~16 raw order/vendor-order statuses; the storefront
// timeline only shows four milestones. Map every customer-visible raw status
// onto its milestone so intermediate states (processing, out_for_delivery,
// partially_*) light up the right step instead of collapsing to -1 (which
// blanked the whole timeline). Unknown/pre-payment statuses stay at -1.
const STATUS_STEP: Record<string, number> = {
	placed: 0,
	pending_payment: 0,
	confirmed: 0,
	processing: 0,
	ready_to_ship: 0,
	shipped: 1,
	partially_shipped: 1,
	out_for_delivery: 2,
	delivered: 3,
	partially_delivered: 3,
};

// Statuses that end the order rather than advance it. A progress bar is the
// wrong shape for these: with no step to light up they render as four grey
// milestones, which reads as "nothing has happened yet" — the opposite of the
// truth. This is rendered per vendor sub-order, and vendor_orders.status is the
// full OrderStatus enum (order-status.service sets `cancelled` on the vendor
// order directly), so one vendor can cancel while the parent order stays live.
const TERMINAL_STATUS: Record<string, string> = {
	cancelled: "cancelled",
	refunded: "refunded",
	partially_refunded: "refunded",
	returned: "returned",
};

export function OrderTimeline({ currentStatus, className }: { currentStatus: string; className?: string }) {
	const t = useTranslations("account.orderStatus");
	const normalized = currentStatus.toLowerCase();
	const terminal = TERMINAL_STATUS[normalized];
	const currentIndex = STATUS_STEP[normalized] ?? -1;

	if (terminal) {
		return (
			<StatusBadge tone={terminal === "cancelled" ? "error" : "neutral"} className={className}>
				{t(terminal)}
			</StatusBadge>
		);
	}

	// Delivered is the last milestone and is itself complete.
	const isFinal = currentIndex === statuses.length - 1;
	return (
		<StepTrack
			className={className}
			current={isFinal ? statuses.length : currentIndex}
			steps={statuses.map((s) => ({ key: s, label: t(s) }))}
		/>
	);
}
