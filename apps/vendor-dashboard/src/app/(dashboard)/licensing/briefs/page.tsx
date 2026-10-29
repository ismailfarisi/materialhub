"use client";

import { formatAED } from "@/lib/queries/creator-content";
import {
	type BriefStatus,
	type CreateBriefInput,
	useCreateBrief,
	useVendorBriefs,
} from "@/lib/queries/licensing";
import Link from "next/link";
import { useState } from "react";
import { BriefForm } from "./_components/BriefForm";

const STATUS_STYLE: Record<BriefStatus, string> = {
	open: "bg-amber-100 text-amber-700",
	awarded: "bg-blue-100 text-blue-700",
	fulfilled: "bg-green-100 text-green-700",
	cancelled: "bg-neutral-100 text-neutral-600",
	expired: "bg-neutral-100 text-neutral-600",
};

const STATUS_LABEL: Record<BriefStatus, string> = {
	open: "Open",
	awarded: "Awarded",
	fulfilled: "Fulfilled",
	cancelled: "Cancelled",
	expired: "Expired",
};

function closesIn(iso: string): string {
	const ms = new Date(iso).getTime() - Date.now();
	if (ms <= 0) return "closed";
	const days = Math.floor(ms / 86_400_000);
	if (days >= 1) return `in ${days}d`;
	const hours = Math.floor(ms / 3_600_000);
	return `in ${hours}h`;
}

export default function BriefsPage() {
	const briefs = useVendorBriefs();
	const create = useCreateBrief();
	const [showForm, setShowForm] = useState(false);
	const [error, setError] = useState<string | null>(null);

	function handleCreate(input: CreateBriefInput) {
		setError(null);
		create.mutate(input, {
			onSuccess: () => setShowForm(false),
			onError: (e: unknown) => {
				const err = e as {
					response?: { data?: { message?: string; error?: string } };
				};
				setError(
					err.response?.data?.message ??
						err.response?.data?.error ??
						"Could not create brief.",
				);
			},
		});
	}

	return (
		<div className="p-4">
			<div className="mb-4 flex items-center justify-between">
				<div className="flex items-center gap-3">
					<h1 className="text-xl font-semibold">Briefs</h1>
					<Link
						href="/licensing"
						className="text-sm text-neutral-500 hover:underline"
					>
						← Offers &amp; grants
					</Link>
				</div>
				<button
					type="button"
					onClick={() => setShowForm((v) => !v)}
					className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white"
				>
					{showForm ? "Close" : "New brief"}
				</button>
			</div>

			{showForm && (
				<div className="mb-6">
					<BriefForm
						submitting={create.isPending}
						error={error}
						onSubmit={handleCreate}
						onCancel={() => setShowForm(false)}
					/>
				</div>
			)}

			{briefs.isLoading ? (
				<p className="text-sm text-neutral-500">Loading…</p>
			) : (briefs.data?.length ?? 0) === 0 ? (
				<p className="text-sm text-neutral-500">
					No briefs yet. Post one to invite creators to bid.
				</p>
			) : (
				<div className="overflow-x-auto rounded-lg border border-neutral-200">
					<table className="w-full text-sm">
						<thead className="bg-neutral-50 text-left text-neutral-600">
							<tr>
								<th className="px-3 py-2 font-medium">Title</th>
								<th className="px-3 py-2 font-medium">Status</th>
								<th className="px-3 py-2 font-medium">Budget guide</th>
								<th className="px-3 py-2 font-medium">Bids close</th>
								<th className="px-3 py-2 font-medium" />
							</tr>
						</thead>
						<tbody>
							{briefs.data?.map((b) => (
								<tr key={b.id} className="border-t border-neutral-100">
									<td className="px-3 py-2 font-medium">{b.title}</td>
									<td className="px-3 py-2">
										<span
											className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[b.status]}`}
										>
											{STATUS_LABEL[b.status]}
										</span>
									</td>
									<td className="px-3 py-2">
										{b.budget_guide_fils
											? formatAED(Number(b.budget_guide_fils))
											: "—"}
									</td>
									<td className="px-3 py-2 text-neutral-600">
										{closesIn(b.bids_close_at)}
									</td>
									<td className="px-3 py-2 text-right">
										<Link
											href={`/licensing/briefs/${b.id}`}
											className="rounded bg-neutral-100 px-2 py-1 text-xs hover:bg-neutral-200"
										>
											View bids
										</Link>
									</td>
								</tr>
							))}
						</tbody>
					</table>
					{(briefs.data?.length ?? 0) > 0 && (
						<div className="border-t border-neutral-100 p-2.5 text-xs text-neutral-500">
							Total: {briefs.data?.length}{" "}
							{briefs.data?.length === 1 ? "brief" : "briefs"}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
