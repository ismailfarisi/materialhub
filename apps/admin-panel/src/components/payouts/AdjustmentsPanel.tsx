"use client";

import { useVendorAdjustments } from "@/lib/queries/payouts";
import { Button, Skeleton } from "@materialhub/ui";
import Link from "next/link";
import { useState } from "react";
import { CreateAdjustmentDialog } from "./CreateAdjustmentDialog";

const PAGE_SIZE = 20;

// Display only — API amounts are always fils. This mirrors the local
// `formatAed` already defined in payouts/[id]/page.tsx, payouts/page.tsx,
// and the payout dialogs; there is no shared/exported money formatter in
// this app so every payouts file keeps its own copy of the same formula.
function formatAed(fils: number) {
	return `AED ${(Math.abs(fils) / 100).toFixed(2)}`;
}

function formatDate(iso: string | null | undefined) {
	if (!iso) return "—";
	return new Date(iso).toLocaleDateString("en-AE", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

export function AdjustmentsPanel({ vendorId }: { vendorId: string }) {
	const [page, setPage] = useState(1);
	const [unsettledOnly, setUnsettledOnly] = useState(false);
	const [createOpen, setCreateOpen] = useState(false);

	const { data, isLoading } = useVendorAdjustments(vendorId, {
		page,
		limit: PAGE_SIZE,
		unsettledOnly: unsettledOnly || undefined,
	});

	const items = data?.items ?? [];
	const total = data?.total ?? 0;

	function resetPage() {
		setPage(1);
	}

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between gap-3">
				<label className="flex items-center gap-2 text-sm text-muted-foreground">
					<input
						type="checkbox"
						checked={unsettledOnly}
						onChange={(e) => {
							setUnsettledOnly(e.target.checked);
							resetPage();
						}}
						className="rounded"
					/>
					Unsettled only
				</label>
				<Button size="sm" onClick={() => setCreateOpen(true)}>
					New Adjustment
				</Button>
			</div>

			{isLoading ? (
				<Skeleton className="h-32" />
			) : items.length === 0 ? (
				<p className="text-sm text-muted-foreground py-8 text-center">
					{unsettledOnly
						? "No unsettled adjustments for this vendor."
						: "No adjustments for this vendor."}
				</p>
			) : (
				<table className="w-full text-sm" data-stack="md">
					<thead className="text-left text-muted-foreground">
						<tr>
							<th className="py-2">Reason</th>
							<th>Source</th>
							<th className="text-right">Amount</th>
							<th>Settled By</th>
							<th className="text-right">Created</th>
						</tr>
					</thead>
					<tbody>
						{items.map((a) => {
							const unsettled = a.settled_payout_id == null;
							return (
								<tr
									key={a.id}
									className={`border-t ${unsettled ? "bg-amber-50/60" : ""}`}
								>
									<td className="py-2" data-card-title>
										{a.reason}
									</td>
									<td data-label="Source" className="capitalize">
										{a.source_type.replace(/_/g, " ")}
									</td>
									<td
										className={`text-right font-medium ${
											a.amount_fils < 0 ? "text-destructive" : "text-green-600"
										}`}
										data-label="Amount"
									>
										{a.amount_fils < 0 ? "− " : "+ "}
										{formatAed(a.amount_fils)}
									</td>
									<td data-label="Settled By">
										{unsettled ? (
											<span className="inline-flex items-center text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
												Unsettled
											</span>
										) : (
											<Link
												href={`/payouts/${a.settled_payout_id}`}
												className="text-primary hover:underline font-mono text-xs"
											>
												{a.settled_payout_id?.slice(0, 8)}
											</Link>
										)}
									</td>
									<td className="text-right" data-label="Created">
										{formatDate(a.created_at)}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			)}

			{!isLoading && items.length > 0 && (
				<div className="flex items-center justify-between pt-1">
					<p className="text-xs text-muted-foreground">
						Total: {total} adjustment{total === 1 ? "" : "s"}
					</p>
					{total > PAGE_SIZE && (
						<div className="flex justify-end gap-2">
							<Button
								size="sm"
								variant="outline"
								disabled={page === 1}
								onClick={() => setPage((p) => p - 1)}
							>
								Previous
							</Button>
							<Button
								size="sm"
								variant="outline"
								disabled={page * PAGE_SIZE >= total}
								onClick={() => setPage((p) => p + 1)}
							>
								Next
							</Button>
						</div>
					)}
				</div>
			)}

			<CreateAdjustmentDialog
				open={createOpen}
				onOpenChange={setCreateOpen}
				vendorId={vendorId}
			/>
		</div>
	);
}
