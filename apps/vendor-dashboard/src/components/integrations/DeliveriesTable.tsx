"use client";

import type { Delivery } from "@/lib/integrations/api";
import { Spinner } from "@phosphor-icons/react";

interface DeliveriesTableProps {
	deliveries: Delivery[];
	onSelect: (d: Delivery) => void;
	isLoading: boolean;
}

function relativeTime(iso: string): string {
	const diffMs = Date.now() - new Date(iso).getTime();
	const diffSec = Math.floor(diffMs / 1000);
	if (diffSec < 60) return `${diffSec}s ago`;
	const diffMin = Math.floor(diffSec / 60);
	if (diffMin < 60) return `${diffMin} min ago`;
	const diffHr = Math.floor(diffMin / 60);
	if (diffHr < 24) return `${diffHr}h ago`;
	return `${Math.floor(diffHr / 24)}d ago`;
}

function statusColors(status: Delivery["status"]): string {
	switch (status) {
		case "delivered":
			return "bg-amber/20 text-amber border border-amber/40";
		case "failed":
		case "dlq":
			return "bg-russet/10 text-russet border border-russet/30";
		case "skipped":
			return "bg-taupe/10 text-taupe border border-taupe/20";
		default:
			return "bg-pearl/10 text-taupe border border-pearl/20";
	}
}

function directionColors(direction: Delivery["direction"]): string {
	if (direction === "outbound")
		return "bg-amber/20 text-amber border border-amber/30";
	return "bg-taupe/10 text-taupe border border-taupe/20";
}

export function DeliveriesTable({
	deliveries,
	onSelect,
	isLoading,
}: DeliveriesTableProps) {
	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-16 text-taupe">
				<Spinner className="animate-spin mr-2" size={18} />
				<span className="text-sm">Loading deliveries…</span>
			</div>
		);
	}

	if (deliveries.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-16 text-taupe text-sm">
				No deliveries yet. Use TEST FIRE to send a synthetic event.
			</div>
		);
	}

	return (
		<div className="border border-pearl/14 rounded-lg overflow-hidden">
			<table className="w-full text-sm" data-stack="md">
				<thead>
					<tr className="border-b border-pearl/14 bg-linen">
						<th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-taupe font-medium">
							When
						</th>
						<th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-taupe font-medium">
							Direction
						</th>
						<th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-taupe font-medium">
							Event Type
						</th>
						<th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-taupe font-medium">
							Status
						</th>
						<th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-taupe font-medium">
							HTTP
						</th>
					</tr>
				</thead>
				<tbody>
					{deliveries.map((d, i) => (
						<tr
							key={d.id}
							onClick={() => onSelect(d)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") onSelect(d);
							}}
							tabIndex={0}
							className={[
								"cursor-pointer transition-colors hover:bg-linen",
								i < deliveries.length - 1 ? "border-b border-pearl/10" : "",
							].join(" ")}
						>
							<td
								className="px-4 py-3 text-taupe whitespace-nowrap"
								data-label="When"
							>
								{relativeTime(d.created_at)}
							</td>
							<td className="px-4 py-3" data-label="Direction">
								<span
									className={[
										"text-xs uppercase tracking-wide font-medium px-2 py-0.5 rounded-sm",
										directionColors(d.direction),
									].join(" ")}
								>
									{d.direction}
								</span>
							</td>
							<td
								className="px-4 py-3 font-mono text-xs text-cacao"
								data-label="Event Type"
							>
								{d.event_type}
							</td>
							<td className="px-4 py-3" data-label="Status">
								<span
									className={[
										"text-xs uppercase tracking-wide font-medium px-2 py-0.5 rounded-sm",
										statusColors(d.status),
									].join(" ")}
								>
									{d.status}
								</span>
							</td>
							<td
								className="px-4 py-3 font-mono text-xs text-taupe"
								data-label="HTTP"
							>
								{d.status_code ?? "—"}
							</td>
						</tr>
					))}
				</tbody>
			</table>
			{deliveries.length > 0 && (
				<div className="p-3 border-t border-pearl/14 text-xs text-taupe">
					Total: {deliveries.length}{" "}
					{deliveries.length === 1 ? "delivery" : "deliveries"}
				</div>
			)}
		</div>
	);
}
