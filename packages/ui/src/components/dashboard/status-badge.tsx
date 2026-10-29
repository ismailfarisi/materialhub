"use client";

import { cn } from "../../lib/utils";

const DEFAULT_COLOR_MAP: Record<string, string> = {
	// Generic content states
	draft: "bg-pearl/20 text-taupe border border-pearl/30",
	published: "bg-amber/10 text-amber border border-amber/30",
	archived: "bg-taupe/10 text-taupe border border-taupe/30",
	// Approval states
	pending: "bg-caramel/10 text-caramel border border-caramel/30",
	pending_review: "bg-caramel/10 text-caramel border border-caramel/30",
	approved: "bg-amber/10 text-amber border border-amber/30",
	rejected: "bg-russet/10 text-russet border border-russet/30",
	suspended: "bg-russet/10 text-russet border border-russet/30",
	// Order / payment states
	open: "bg-taupe/10 text-taupe border border-taupe/30",
	processing: "bg-taupe/10 text-taupe border border-taupe/30",
	confirmed: "bg-amber/10 text-amber border border-amber/30",
	paid: "bg-amber/10 text-amber border border-amber/30",
	shipped: "bg-caramel/10 text-caramel border border-caramel/30",
	in_transit: "bg-caramel/10 text-caramel border border-caramel/30",
	delivered: "bg-amber/10 text-amber border border-amber/30",
	completed: "bg-amber/10 text-amber border border-amber/30",
	cancelled: "bg-russet/10 text-russet border border-russet/30",
	refunded: "bg-caramel/10 text-caramel border border-caramel/30",
	failed: "bg-russet/10 text-russet border border-russet/30",
	// Booking states (booking-service). `confirmed`, `completed` and `cancelled`
	// are shared with the order vocabulary above and already mapped.
	pending_payment: "bg-caramel/10 text-caramel border border-caramel/30",
	rescheduled: "bg-caramel/10 text-caramel border border-caramel/30",
	no_show: "bg-russet/10 text-russet border border-russet/30",
	expired: "bg-pearl/20 text-taupe border border-pearl/30",
	held: "bg-taupe/10 text-taupe border border-taupe/30",
	// Vendor / KYC
	active: "bg-amber/10 text-amber border border-amber/30",
	inactive: "bg-pearl/20 text-taupe border border-pearl/30",
	under_review: "bg-caramel/10 text-caramel border border-caramel/30",
	verified: "bg-amber/10 text-amber border border-amber/30",
	// Support tickets
	open_ticket: "bg-taupe/10 text-taupe border border-taupe/30",
	in_progress: "bg-caramel/10 text-caramel border border-caramel/30",
	resolved: "bg-amber/10 text-amber border border-amber/30",
	closed: "bg-pearl/20 text-taupe border border-pearl/30",
	// Return / dispute
	requested: "bg-caramel/10 text-caramel border border-caramel/30",
	accepted: "bg-amber/10 text-amber border border-amber/30",
	disputed: "bg-russet/10 text-russet border border-russet/30",
	escalated: "bg-russet/10 text-russet border border-russet/30",
};

interface StatusBadgeProps {
	status: string;
	colorMap?: Record<string, string>;
}

export function StatusBadge({ status, colorMap }: StatusBadgeProps) {
	if (!status) return null;
	const map = colorMap ?? DEFAULT_COLOR_MAP;
	const colorClass = map[status] ?? "bg-pearl/20 text-taupe border border-pearl/30";
	const label = status
		.replace(/_/g, " ")
		.replace(/\b\w/g, (c) => c.toUpperCase());

	return (
		<span
			className={cn(
				"inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
				colorClass,
			)}
		>
			{label}
		</span>
	);
}
