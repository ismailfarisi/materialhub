"use client";

import {
	COLLAB_STATUS_STYLE,
	COLLAB_TYPE_LABEL,
	type CollabOpportunity,
	type CollabStatus,
	type CollabType,
	useVendorCollabs,
} from "@/lib/queries/collabs";
import { formatAED } from "@/lib/queries/creator-content";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const STATUSES: CollabStatus[] = [
	"draft",
	"open",
	"filled",
	"completed",
	"cancelled",
	"expired",
];
const TYPES: CollabType[] = ["product_seeding", "paid_campaign", "event_appearance"];

function closesIn(iso: string | null): string {
	if (!iso) return "no closing date";
	const ms = new Date(iso).getTime() - Date.now();
	if (ms <= 0) return "closed";
	const days = Math.floor(ms / 86_400_000);
	if (days >= 1) return `closes in ${days}d`;
	return `closes in ${Math.floor(ms / 3_600_000)}h`;
}

/** What the vendor is actually offering, in one line. */
function considerationLabel(c: CollabOpportunity): string {
	if (c.type === "paid_campaign" || c.type === "event_appearance") {
		return c.fee_fils ? formatAED(Number(c.fee_fils)) : "no fee set";
	}
	const qty = c.seeded_qty ?? 0;
	return `${qty} unit${qty === 1 ? "" : "s"}`;
}

export default function CollabsPage() {
	const router = useRouter();
	const searchParams = useSearchParams();

	const status = (searchParams.get("status") ?? "") as CollabStatus | "";
	const type = (searchParams.get("type") ?? "") as CollabType | "";

	const updateParam = useCallback(
		(updates: Record<string, string | null | undefined>) => {
			const params = new URLSearchParams(searchParams.toString());
			for (const [key, value] of Object.entries(updates)) {
				if (value) params.set(key, value);
				else params.delete(key);
			}
			const qs = params.toString();
			router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
		},
		[router, searchParams],
	);

	const { data, isLoading } = useVendorCollabs({
		status: status || undefined,
		type: type || undefined,
	});
	const collabs = data ?? [];

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold">Collaborations</h1>
					<p className="text-sm text-neutral-500">
						Seed product, run a paid campaign, or book a creator for an event.
					</p>
				</div>
				<Link
					href="/collabs/new"
					className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
				>
					New collaboration
				</Link>
			</div>

			<div className="flex flex-wrap gap-2">
				<select
					value={type}
					onChange={(e) => updateParam({ type: e.target.value || null })}
					className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
					aria-label="Filter by type"
				>
					<option value="">All types</option>
					{TYPES.map((t) => (
						<option key={t} value={t}>
							{COLLAB_TYPE_LABEL[t]}
						</option>
					))}
				</select>
				<select
					value={status}
					onChange={(e) => updateParam({ status: e.target.value || null })}
					className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
					aria-label="Filter by status"
				>
					<option value="">All statuses</option>
					{STATUSES.map((s) => (
						<option key={s} value={s}>
							{s.charAt(0).toUpperCase() + s.slice(1)}
						</option>
					))}
				</select>
				{(status || type) && (
					<button
						type="button"
						onClick={() => updateParam({ status: null, type: null })}
						className="rounded-md px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
					>
						Clear filters
					</button>
				)}
			</div>

			{isLoading ? (
				<p className="text-sm text-neutral-500">Loading…</p>
			) : collabs.length === 0 ? (
				<div className="rounded-lg border border-dashed border-neutral-300 p-10 text-center">
					<p className="text-sm text-neutral-600">
						{status || type
							? "No collaborations match these filters."
							: "No collaborations yet."}
					</p>
				</div>
			) : (
				<div className="overflow-x-auto rounded-lg border border-neutral-200">
					<table className="w-full text-sm">
						<thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
							<tr>
								<th className="px-4 py-3 font-medium">Title</th>
								<th className="px-4 py-3 font-medium">Type</th>
								<th className="px-4 py-3 font-medium">Offering</th>
								<th className="px-4 py-3 font-medium">Slots</th>
								<th className="px-4 py-3 font-medium">Visibility</th>
								<th className="px-4 py-3 font-medium">Status</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-neutral-100">
							{collabs.map((c) => (
								<tr key={c.id} className="hover:bg-neutral-50">
									<td className="px-4 py-3">
										<Link href={`/collabs/${c.id}`} className="font-medium hover:underline">
											{c.title}
										</Link>
										<div className="text-xs text-neutral-500">
											{closesIn(c.applications_close_at)}
										</div>
									</td>
									<td className="px-4 py-3">{COLLAB_TYPE_LABEL[c.type]}</td>
									<td className="px-4 py-3">{considerationLabel(c)}</td>
									<td className="px-4 py-3 tabular-nums">
										{c.slots_filled}/{c.slots_total}
									</td>
									<td className="px-4 py-3 text-neutral-600">
										{c.visibility === "board" ? "Open board" : "Direct invite"}
									</td>
									<td className="px-4 py-3">
										<span
											className={`rounded-full px-2 py-1 text-xs font-medium ${COLLAB_STATUS_STYLE[c.status]}`}
										>
											{c.status}
										</span>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
