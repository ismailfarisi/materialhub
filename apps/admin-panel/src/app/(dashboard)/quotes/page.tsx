"use client";

import { REQUEST_STATUS_OPTIONS, day } from "@/components/quotes/quote-format";
import { type AdminQuoteRow, useAdminQuotes } from "@/lib/queries/quotes";
import {
	Button,
	DataTable,
	EmptyState,
	FiltersBar,
	StatusBadge,
} from "@materialhub/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { FileText } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const PAGE_SIZE = 20;

/** Read-only: support looks up a buyer's request and what each supplier quoted. */
export default function AdminQuotesPage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const status = searchParams.get("status") ?? "__all__";
	const q = searchParams.get("q") ?? "";
	const page = Math.max(1, Number(searchParams.get("page") ?? "1"));

	const updateParam = useCallback(
		(updates: Record<string, string | null>, resetPage = true) => {
			const params = new URLSearchParams(searchParams.toString());
			for (const [k, v] of Object.entries(updates)) {
				if (v && v !== "__all__") params.set(k, v);
				else params.delete(k);
			}
			if (resetPage && !updates.page) params.delete("page");
			const qs = params.toString();
			router.replace(qs ? `?${qs}` : window.location.pathname, {
				scroll: false,
			});
		},
		[router, searchParams],
	);

	const { data, isLoading } = useAdminQuotes({
		status,
		q: q || undefined,
		page,
		limit: PAGE_SIZE,
	});
	const rows = data?.items ?? [];
	const total = data?.total ?? 0;
	const totalPages = Math.ceil(total / PAGE_SIZE);

	const columns: ColumnDef<AdminQuoteRow>[] = [
		{
			id: "request",
			header: "Request",
			cell: ({ row: { original: r } }) => (
				<Link
					href={`/quotes/${r.id}`}
					className="grid max-w-[300px] gap-0.5 hover:underline"
				>
					<span className="truncate text-sm font-medium">{r.title}</span>
					<span className="font-mono text-xs tabular-nums text-muted-foreground">
						{r.request_number}
					</span>
				</Link>
			),
		},
		{
			id: "buyer",
			header: "Buyer",
			cell: ({ row: { original: r } }) => (
				<span className="text-sm">{r.buyer?.email ?? "—"}</span>
			),
		},
		{
			id: "quantity",
			header: "Quantity",
			cell: ({ row: { original: r } }) => (
				<span className="whitespace-nowrap font-mono text-sm tabular-nums">
					{r.quantity.toLocaleString("en-AE")} {r.unit}
				</span>
			),
		},
		{
			id: "suppliers",
			header: "Suppliers",
			cell: ({ row: { original: r } }) => (
				<span className="text-sm">
					{r.suppliers
						.map((s) => s.vendor?.name)
						.filter(Boolean)
						.join(", ")}
				</span>
			),
		},
		{
			id: "status",
			header: "Status",
			cell: ({ row: { original: r } }) => <StatusBadge status={r.status} />,
		},
		{
			id: "created",
			header: "Sent",
			cell: ({ row: { original: r } }) => (
				<span className="whitespace-nowrap text-sm text-muted-foreground">
					{day(r.created_at)}
				</span>
			),
		},
	];

	return (
		<div className="space-y-4">
			<div>
				<h1 className="text-2xl font-bold">Quote requests</h1>
				<p className="text-sm text-muted-foreground">
					Requests for quotation between buyers and up to three suppliers.
					Read-only, for support.
				</p>
			</div>
			<FiltersBar
				search={{
					placeholder: "Request number, title or buyer email",
					value: q,
					onChange: (v: string) => updateParam({ q: v || null }),
				}}
				filters={[
					{
						key: "status",
						label: "Status",
						options: REQUEST_STATUS_OPTIONS,
						value: status,
						onChange: (v: string) => updateParam({ status: v }),
					},
				]}
			/>
			{!isLoading && rows.length === 0 ? (
				<EmptyState
					icon={<FileText size={40} />}
					title="No quote requests"
					description={
						q || status !== "__all__"
							? "Nothing matches these filters."
							: "Buyers haven't sent any requests yet."
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
