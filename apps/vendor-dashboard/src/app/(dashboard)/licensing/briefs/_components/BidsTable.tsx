"use client";

import { formatAED } from "@/lib/queries/creator-content";
import type { BriefBid, BriefBidStatus } from "@/lib/queries/licensing";

const BID_STATUS_STYLE: Record<BriefBidStatus, string> = {
	pending: "bg-amber-100 text-amber-700",
	accepted: "bg-blue-100 text-blue-700",
	delivered: "bg-violet-100 text-violet-700",
	revision_requested: "bg-orange-100 text-orange-700",
	completed: "bg-green-100 text-green-700",
	rejected: "bg-rose-100 text-rose-700",
	withdrawn: "bg-neutral-100 text-neutral-600",
	declined: "bg-neutral-100 text-neutral-600",
};

const BID_STATUS_LABEL: Record<BriefBidStatus, string> = {
	pending: "Pending",
	accepted: "Accepted",
	delivered: "Delivered",
	revision_requested: "Revision requested",
	completed: "Completed",
	rejected: "Rejected",
	withdrawn: "Withdrawn",
	declined: "Declined",
};

export interface BidsTableProps {
	bids: BriefBid[];
	/** Per-row actions (Task 5 supplies this). */
	renderActions?: (bid: BriefBid) => React.ReactNode;
}

export function BidsTable({ bids, renderActions }: BidsTableProps) {
	if (bids.length === 0) {
		return <p className="text-sm text-neutral-500">No bids yet.</p>;
	}
	return (
		<div className="overflow-x-auto rounded-lg border border-neutral-200">
			<table className="w-full text-sm">
				<thead className="bg-neutral-50 text-left text-neutral-600">
					<tr>
						<th className="px-3 py-2 font-medium">Creator</th>
						<th className="px-3 py-2 font-medium">Amount</th>
						<th className="px-3 py-2 font-medium">Pitch</th>
						<th className="px-3 py-2 font-medium">Status</th>
						{renderActions && <th className="px-3 py-2 font-medium" />}
					</tr>
				</thead>
				<tbody>
					{bids.map((bid) => (
						<tr key={bid.id} className="border-t border-neutral-100 align-top">
							<td className="px-3 py-2 font-mono text-xs text-neutral-500">
								{bid.creator_id.slice(0, 8)}…
							</td>
							<td className="px-3 py-2">
								{formatAED(Number(bid.amount_fils))}
							</td>
							<td className="px-3 py-2 max-w-xs text-neutral-700">
								{bid.pitch}
							</td>
							<td className="px-3 py-2">
								<span
									className={`rounded px-2 py-0.5 text-xs ${BID_STATUS_STYLE[bid.status]}`}
								>
									{BID_STATUS_LABEL[bid.status]}
								</span>
							</td>
							{renderActions && (
								<td className="px-3 py-2 text-right">{renderActions(bid)}</td>
							)}
						</tr>
					))}
				</tbody>
			</table>
			<div className="border-t border-neutral-100 p-2 text-xs text-neutral-500">
				Total: {bids.length} {bids.length === 1 ? "bid" : "bids"}
			</div>
		</div>
	);
}
