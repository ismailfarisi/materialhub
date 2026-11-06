"use client";

import {
	QUOTE_STATUS_OPTIONS,
	filsToAed,
	formatDay,
} from "@/components/quotes/quote-helpers";
import { QuoteStatusBadge } from "@/components/quotes/quote-status-badge";
import { type VendorQuoteRow, useVendorQuotes } from "@/lib/queries/quotes";
import { Button, DataTable, EmptyState, FiltersBar, cn } from "@materialhub/ui";
import { FileText } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const PAGE_SIZE = 20;

/** The statuses that need the supplier's attention, as quick tabs above the table. */
const QUICK = [
	{ value: "", label: "All" },
	{ value: "pending", label: "Awaiting your quote" },
	{ value: "responded", label: "Quoted" },
	{ value: "accepted", label: "Won" },
];

export default function VendorQuotesPage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const status = searchParams.get("status") ?? "";
	const q = searchParams.get("q") ?? "";
	const page = Math.max(1, Number(searchParams.get("page") ?? "1"));

	const updateParam = useCallback(
		(updates: Record<string, string | null | undefined>, resetPage = true) => {
			const params = new URLSearchParams(searchParams.toString());
			for (const [key, value] of Object.entries(updates)) {
				if (value) params.set(key, value);
				else params.delete(key);
			}
			if (resetPage && !updates.page) params.delete("page");
			const qs = params.toString();
			router.replace(qs ? `?${qs}` : window.location.pathname, {
				scroll: false,
			});
		},
		[router, searchParams],
	);

	const { data, isLoading } = useVendorQuotes({
		status: status || undefined,
		q: q || undefined,
		page,
		limit: PAGE_SIZE,
	});
	const rows = data?.items ?? [];
	const total = data?.total ?? 0;
	const counts = data?.statusCounts ?? {};
	const totalPages = Math.ceil(total / PAGE_SIZE);
	const allCount = Object.values(counts).reduce((a, b) => a + b, 0);

	const columns = [
		{
			id: "request",
			header: "Request",
			cell: ({
				row: { original: r },
			}: { row: { original: VendorQuoteRow } }) => (
				<Link
					href={`/quotes/${r.id}`}
					className="grid max-w-[320px] gap-0.5 hover:underline"
				>
					<span className="truncate text-sm font-medium text-foreground">
						{r.request.title}
					</span>
					<span className="font-mono text-xs tabular-nums text-muted-foreground">
						{r.request.request_number}
					</span>
				</Link>
			),
		},
		{
			id: "quantity",
			header: "Quantity",
			cell: ({
				row: { original: r },
			}: { row: { original: VendorQuoteRow } }) => (
				<span className="whitespace-nowrap font-mono text-sm tabular-nums">
					{r.request.quantity.toLocaleString("en-AE")} {r.request.unit}
				</span>
			),
		},
		{
			id: "need_by",
			header: "Needed by",
			cell: ({
				row: { original: r },
			}: { row: { original: VendorQuoteRow } }) => (
				<span className="whitespace-nowrap font-mono text-sm tabular-nums text-muted-foreground">
					{r.request.need_by ? formatDay(r.request.need_by) : "—"}
				</span>
			),
		},
		{
			id: "deliver_to",
			header: "Deliver to",
			cell: ({
				row: { original: r },
			}: { row: { original: VendorQuoteRow } }) => (
				<span className="text-sm">{r.request.delivery_emirate}</span>
			),
		},
		{
			id: "your_quote",
			header: "Your quote",
			cell: ({
				row: { original: r },
			}: { row: { original: VendorQuoteRow } }) =>
				r.current_response ? (
					<span className="whitespace-nowrap font-mono text-sm tabular-nums">
						AED {filsToAed(r.current_response.unit_price)} / {r.request.unit}
					</span>
				) : (
					<span className="text-sm text-muted-foreground">—</span>
				),
		},
		{
			id: "status",
			header: "Status",
			cell: ({
				row: { original: r },
			}: { row: { original: VendorQuoteRow } }) => (
				<QuoteStatusBadge status={r.status} />
			),
		},
		{
			id: "received",
			header: "Received",
			cell: ({
				row: { original: r },
			}: { row: { original: VendorQuoteRow } }) => (
				<span className="whitespace-nowrap text-sm text-muted-foreground">
					{formatDay(r.request.created_at)}
				</span>
			),
		},
		{
			id: "actions",
			header: "",
			cell: ({
				row: { original: r },
			}: { row: { original: VendorQuoteRow } }) => (
				<div className="flex justify-end">
					<Button
						asChild
						size="sm"
						variant={r.status === "pending" ? "default" : "outline"}
					>
						<Link href={`/quotes/${r.id}`}>
							{r.status === "pending" ? "Quote" : "Open"}
						</Link>
					</Button>
				</div>
			),
		},
	];

	return (
		<div className="space-y-4">
			<div>
				<h1 className="text-2xl font-bold text-gray-900">Quote requests</h1>
				<p className="text-sm text-gray-500">
					Buyers asking you to price a run. Each buyer can ask up to three
					suppliers; you only see your own quote.
				</p>
			</div>

			<fieldset
				className="flex flex-wrap gap-1.5"
				aria-label="Quick status filter"
			>
				{QUICK.map((s) => {
					const active = status === s.value;
					const n = s.value ? (counts[s.value] ?? 0) : allCount;
					return (
						<button
							key={s.value || "all"}
							type="button"
							aria-pressed={active}
							onClick={() => updateParam({ status: s.value || null })}
							className={cn(
								"inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm transition-colors",
								active
									? "border-foreground bg-foreground text-background"
									: "border-border bg-background hover:border-foreground/40",
							)}
						>
							{s.label}
							<span className="font-mono text-xs tabular-nums opacity-70">
								{n}
							</span>
						</button>
					);
				})}
			</fieldset>

			<FiltersBar
				search={{
					placeholder: "Search request number or title",
					value: q,
					onChange: (v: string) => updateParam({ q: v || null }),
				}}
				filters={[
					{
						key: "status",
						label: "Status",
						options: QUOTE_STATUS_OPTIONS,
						value: status,
						onChange: (v: string) => updateParam({ status: v || null }),
					},
				]}
			/>

			{!isLoading && rows.length === 0 ? (
				<EmptyState
					icon={<FileText size={40} />}
					title={status || q ? "No requests match" : "No quote requests yet"}
					description={
						status || q
							? "Try another status or clear the search."
							: "When a buyer asks you to price a run, it appears here."
					}
				/>
			) : (
				<>
					<DataTable
						columns={columns}
						data={rows}
						isLoading={isLoading}
						rowId="id"
					/>
					<div className="flex items-center justify-between pt-2">
						<span className="text-sm text-muted-foreground">
							{totalPages > 1
								? `Page ${page} of ${totalPages} (${total} requests)`
								: `Total: ${total}`}
						</span>
						{totalPages > 1 && (
							<div className="flex gap-2">
								<Button
									size="sm"
									variant="outline"
									disabled={page === 1}
									onClick={() => updateParam({ page: String(page - 1) }, false)}
								>
									Previous
								</Button>
								<Button
									size="sm"
									variant="outline"
									disabled={page >= totalPages}
									onClick={() => updateParam({ page: String(page + 1) }, false)}
								>
									Next
								</Button>
							</div>
						)}
					</div>
				</>
			)}
		</div>
	);
}
