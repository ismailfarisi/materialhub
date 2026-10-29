"use client";

import { usePayoutEstimate, usePayouts } from "@/lib/queries/payouts";
import {
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	DataTable,
	EmptyState,
	FiltersBar,
	Skeleton,
	StatusBadge,
} from "@materialhub/ui";
import { Clock, TrendUp, Wallet } from "@phosphor-icons/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

const STATUS_OPTIONS = [
	{ label: "All Statuses", value: "" },
	{ label: "Pending", value: "pending" },
	{ label: "Processing", value: "processing" },
	{ label: "Paid", value: "paid" },
	{ label: "Failed", value: "failed" },
];

function formatCurrency(fils: number) {
	return `AED ${(fils / 100).toFixed(2)}`;
}

function formatDate(iso: string) {
	return new Date(iso).toLocaleDateString("en-AE", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

export default function PayoutsPage() {
	const router = useRouter();
	const searchParams = useSearchParams();

	const status = searchParams.get("status") ?? "";
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
			router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
		},
		[router, searchParams],
	);

	const { data, isLoading } = usePayouts({
		status: status || undefined,
		page,
		limit: 20,
	});
	const { data: estimate, isLoading: estimateLoading } = usePayoutEstimate();

	const payouts: any[] = data?.items ?? [];
	const total: number = data?.total ?? 0;
	const totalPages = Math.ceil(total / 20);

	const columns = [
		{
			id: "reference",
			header: "Reference",
			cell: ({ row: { original: row } }: { row: { original: any } }) => (
				<span className="text-sm font-medium font-mono">
					{row.reference ?? row.id?.slice(0, 8)}
				</span>
			),
		},
		{
			id: "period",
			header: "Period",
			cell: ({ row: { original: row } }: { row: { original: any } }) => (
				<span className="text-sm">
					{row.period_start
						? `${formatDate(row.period_start)} – ${formatDate(row.period_end)}`
						: "—"}
				</span>
			),
		},
		{
			id: "gross",
			header: "Gross",
			cell: ({ row: { original: row } }: { row: { original: any } }) => (
				<span className="text-sm">
					{row.gross != null ? formatCurrency(row.gross) : "—"}
				</span>
			),
		},
		{
			id: "commission",
			header: "Commission",
			cell: ({ row: { original: row } }: { row: { original: any } }) => (
				<span className="text-sm text-destructive">
					{row.commission != null ? `- ${formatCurrency(row.commission)}` : "—"}
				</span>
			),
		},
		{
			id: "net",
			header: "Net",
			cell: ({ row: { original: row } }: { row: { original: any } }) => (
				<span className="text-sm font-semibold">
					{row.net != null ? formatCurrency(row.net) : "—"}
				</span>
			),
		},
		{
			id: "status",
			header: "Status",
			cell: ({ row: { original: row } }: { row: { original: any } }) => (
				<StatusBadge status={row.status} />
			),
		},
	];

	return (
		<div className="space-y-5">
			<div>
				<h1 className="text-2xl font-bold text-gray-900">Payouts</h1>
				<p className="text-sm text-gray-500">
					Track your earnings and payout schedule
				</p>
			</div>

			{/* Summary Cards */}
			<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
				{estimateLoading ? (
					<>
						{Array.from({ length: 3 }).map((_, i) => (
							<Skeleton key={i} className="h-24 rounded-xl" />
						))}
					</>
				) : (
					<>
						<Card>
							<CardHeader className="pb-2 flex-row items-center gap-2 space-y-0">
								<TrendUp size={16} className="text-primary" />
								<CardTitle className="text-sm font-medium text-muted-foreground">
									Next Payout Estimate
								</CardTitle>
							</CardHeader>
							<CardContent>
								<p className="text-xl font-bold">
									{estimate?.net_amount != null
										? formatCurrency(estimate.net_amount)
										: "—"}
								</p>
								{estimate?.pending_count > 0 && (
									<p className="text-xs text-muted-foreground mt-0.5">
										from {estimate.pending_count} item
										{estimate.pending_count === 1 ? "" : "s"}
									</p>
								)}
							</CardContent>
						</Card>

						<Card>
							<CardHeader className="pb-2 flex-row items-center gap-2 space-y-0">
								<Clock size={16} className="text-amber-500" />
								<CardTitle className="text-sm font-medium text-muted-foreground">
									Total Pending (ex-VAT)
								</CardTitle>
							</CardHeader>
							<CardContent>
								<p className="text-xl font-bold">
									{estimate?.gross_amount != null
										? formatCurrency(estimate.gross_amount)
										: "—"}
								</p>
								{estimate?.vat_total > 0 && (
									<p className="text-xs text-muted-foreground mt-0.5">
										{formatCurrency(estimate.vat_total)} VAT filed by MaterialHub
									</p>
								)}
								{estimate?.commission_total > 0 && (
									<p className="text-xs text-muted-foreground">
										less {formatCurrency(estimate.commission_total)} commission
									</p>
								)}
							</CardContent>
						</Card>

						<Card>
							<CardHeader className="pb-2 flex-row items-center gap-2 space-y-0">
								<Wallet size={16} className="text-green-600" />
								<CardTitle className="text-sm font-medium text-muted-foreground">
									Effective Commission Rate
								</CardTitle>
							</CardHeader>
							<CardContent>
								<p className="text-xl font-bold">
									{estimate?.gross_amount > 0
										? `${((estimate.commission_total / estimate.gross_amount) * 100).toFixed(1)}%`
										: "—"}
								</p>
							</CardContent>
						</Card>
					</>
				)}
			</div>

			<FiltersBar
				filters={[
					{
						key: "status",
						label: "Status",
						options: STATUS_OPTIONS,
						value: status,
						onChange: (v: string) => updateParam({ status: v || null }),
					},
				]}
			/>

			{!isLoading && payouts.length === 0 ? (
				<EmptyState
					icon={<Wallet size={40} />}
					title="No payouts yet"
					description="Your payout history will appear here once you start selling."
				/>
			) : (
				<>
					<DataTable
						columns={columns}
						data={payouts}
						isLoading={isLoading}
						rowId="id"
					/>
					<div className="flex items-center justify-between pt-2">
						<span className="text-sm text-muted-foreground">
							{totalPages > 1
								? `Page ${page} of ${totalPages} (${total} payouts)`
								: `Total: ${total} ${total === 1 ? "payout" : "payouts"}`}
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
