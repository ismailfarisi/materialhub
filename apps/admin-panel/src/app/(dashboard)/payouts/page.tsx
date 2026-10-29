"use client";

import { GeneratePayoutDialog } from "@/components/payouts/GeneratePayoutDialog";
import {
	type AdminPayoutFilters,
	type AdminPayoutListRow,
	useAdminPayoutSummary,
	useAdminPayouts,
} from "@/lib/queries/payouts";
import { useVendors } from "@/lib/queries/vendors";
import {
	Button,
	DataTable,
	EmptyState,
	FiltersBar,
	Input,
	Skeleton,
	StatCard,
	StatusBadge,
} from "@materialhub/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, Clock, Inbox, TrendingUp, Wallet } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

const STATUS_OPTIONS = [
	{ label: "All Statuses", value: "__all__" },
	{ label: "Draft (awaiting approval)", value: "pending" },
	{ label: "Processing", value: "processing" },
	{ label: "Paid", value: "paid" },
	{ label: "Failed", value: "failed" },
];

interface VendorItem {
	id: string;
	business_name?: string;
	display_name?: string;
	name?: string;
}

function formatAed(fils: number | null | undefined) {
	if (fils == null) return "—";
	return `AED ${(fils / 100).toFixed(2)}`;
}

function formatDate(iso: string) {
	return new Date(iso).toLocaleDateString("en-AE", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

export default function PayoutsListPage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [generateOpen, setGenerateOpen] = useState(false);

	const vendorFilter = searchParams.get("vendor_id") ?? "__all__";
	const statusFilter = searchParams.get("status") ?? "__all__";
	const periodFrom = searchParams.get("period_from") ?? "";
	const periodTo = searchParams.get("period_to") ?? "";
	const reference = searchParams.get("reference") ?? "";
	const minNet = searchParams.get("min_net") ?? "";
	const maxNet = searchParams.get("max_net") ?? "";
	const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
	const pagination = useMemo(() => ({ pageIndex: page - 1, pageSize: 20 }), [page]);

	const updateParam = useCallback(
		(updates: Record<string, string | null | undefined>, resetPage = true) => {
			const params = new URLSearchParams(searchParams.toString());
			for (const [key, value] of Object.entries(updates)) {
				if (value && value !== "__all__") params.set(key, value);
				else params.delete(key);
			}
			if (resetPage && !updates.page) params.delete("page");
			const qs = params.toString();
			router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
		},
		[router, searchParams],
	);

	const filters: AdminPayoutFilters = {
		vendorId: vendorFilter !== "__all__" ? vendorFilter : undefined,
		status: statusFilter !== "__all__" ? statusFilter : undefined,
		periodFrom: periodFrom || undefined,
		periodTo: periodTo || undefined,
		reference: reference || undefined,
		minNet: minNet ? Number(minNet) * 100 : undefined,
		maxNet: maxNet ? Number(maxNet) * 100 : undefined,
		page,
		limit: pagination.pageSize,
	};

	const { data, isLoading } = useAdminPayouts(filters);
	const summary = useAdminPayoutSummary();
	// Draft count for the summary tile: the summary endpoint doesn't expose
	// it, so pull it from the list query's total for status=pending — the
	// same source the "Draft (awaiting approval)" filter reads from.
	const pendingDrafts = useAdminPayouts({ status: "pending", limit: 1 });
	const { data: vendorsData } = useVendors({ limit: 100 });

	const vendorsResp = vendorsData as
		| { data?: VendorItem[]; items?: VendorItem[] }
		| undefined;
	const vendors = (vendorsResp?.data ?? vendorsResp?.items ?? []) as VendorItem[];

	const items: AdminPayoutListRow[] = data?.items ?? [];
	const total: number = data?.total ?? 0;
	const pageCount = Math.ceil(total / pagination.pageSize) || 1;

	const columns: ColumnDef<AdminPayoutListRow>[] = [
		{
			id: "reference",
			header: "Reference",
			cell: ({ row }) => (
				<button
					type="button"
					onClick={() => router.push(`/payouts/${row.original.id}`)}
					className="font-mono text-sm text-primary hover:underline font-medium"
				>
					{row.original.payout_reference}
				</button>
			),
		},
		{
			id: "vendor",
			header: "Vendor",
			cell: ({ row }) => (
				<span className="text-sm text-cacao">{row.original.vendor_name}</span>
			),
		},
		{
			id: "period",
			header: "Period",
			cell: ({ row }) => (
				<span className="text-sm text-taupe whitespace-nowrap">
					{formatDate(row.original.period_start)} –{"  "}
					{formatDate(row.original.period_end)}
				</span>
			),
		},
		{
			id: "gross",
			header: "Gross",
			cell: ({ row }) => (
				<span className="tabular-nums text-sm">
					{formatAed(row.original.gross_amount)}
				</span>
			),
		},
		{
			id: "commission",
			header: "Commission",
			cell: ({ row }) => (
				<span className="tabular-nums text-sm text-red-500">
					- {formatAed(row.original.commission_total)}
				</span>
			),
		},
		{
			id: "net",
			header: "Net",
			cell: ({ row }) => (
				<span className="tabular-nums text-sm font-semibold">
					{formatAed(row.original.net_amount)}
				</span>
			),
		},
		{
			id: "status",
			header: "Status",
			cell: ({ row }) => <StatusBadge status={row.original.status} />,
		},
		{
			id: "created",
			header: "Created",
			cell: ({ row }) => (
				<span className="text-sm text-taupe">
					{formatDate(row.original.created_at)}
				</span>
			),
		},
	];

	const skeletonKeys = ["sk-a", "sk-b", "sk-c", "sk-d", "sk-e"];

	return (
		<div className="space-y-6">
			{/* Page header */}
			<div className="flex items-start justify-between gap-4">
				<div>
					<h1 className="text-2xl font-bold text-cacao mb-1">Payouts</h1>
					<p className="text-taupe text-sm">
						Manage vendor payouts across the marketplace
					</p>
				</div>
				<Button onClick={() => setGenerateOpen(true)} className="flex-shrink-0">
					Generate Payout
				</Button>
			</div>

			{/* Summary cards */}
			{summary.isLoading ? (
				<div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
					{skeletonKeys.map((k) => (
						<Skeleton key={k} className="h-24 rounded-xl" />
					))}
				</div>
			) : (
				<div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
					<StatCard
						title="Draft Payouts"
						value={pendingDrafts.data?.total ?? 0}
						icon={<Inbox size={16} className="text-caramel" />}
					/>
					<StatCard
						title="Total Pending"
						value={formatAed(summary.data?.total_pending_fils)}
						icon={<Clock size={16} className="text-amber-500" />}
					/>
					<StatCard
						title="Paid This Month"
						value={formatAed(summary.data?.paid_this_month_fils)}
						icon={<TrendingUp size={16} className="text-primary" />}
					/>
					<StatCard
						title="Processing"
						value={summary.data?.processing_count ?? 0}
						icon={<Wallet size={16} className="text-blue-500" />}
					/>
					<StatCard
						title="Failed"
						value={summary.data?.failed_count ?? 0}
						icon={<AlertTriangle size={16} className="text-red-500" />}
					/>
				</div>
			)}

			{/* Dropdown filters */}
			<FiltersBar
				filters={[
					{
						key: "vendorId",
						label: "Vendor",
						options: [
							{ label: "All Vendors", value: "__all__" },
							...vendors.map((v) => ({
								label: v.business_name ?? v.display_name ?? v.name ?? v.id,
								value: v.id,
							})),
						],
						value: vendorFilter,
						onChange: (v) => updateParam({ vendor_id: v }),
					},
					{
						key: "status",
						label: "Status",
						options: STATUS_OPTIONS,
						value: statusFilter,
						onChange: (v) => updateParam({ status: v }),
					},
				]}
			/>

			{/* Date / text / range inputs */}
			<div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
				<Input
					type="date"
					placeholder="Period from"
					value={periodFrom}
					onChange={(e) => updateParam({ period_from: e.target.value || null })}
				/>
				<Input
					type="date"
					placeholder="Period to"
					value={periodTo}
					onChange={(e) => updateParam({ period_to: e.target.value || null })}
				/>
				<Input
					placeholder="Reference search"
					value={reference}
					onChange={(e) => updateParam({ reference: e.target.value || null })}
				/>
				<Input
					type="number"
					placeholder="Min net (AED)"
					value={minNet}
					onChange={(e) => updateParam({ min_net: e.target.value || null })}
				/>
				<Input
					type="number"
					placeholder="Max net (AED)"
					value={maxNet}
					onChange={(e) => updateParam({ max_net: e.target.value || null })}
				/>
			</div>

			{/* Table or empty state */}
			{!isLoading && items.length === 0 ? (
				<EmptyState
					icon={<Wallet size={40} />}
					title="No payouts found"
					description="Adjust filters or generate a new payout."
				/>
			) : (
				<DataTable
					columns={columns}
					data={items}
					isLoading={isLoading}
					rowId="id"
					pagination={pagination}
					pageCount={pageCount}
					totalCount={total}
					itemLabel="payouts"
					onPaginationChange={(updater) => {
						const next = typeof updater === "function" ? updater(pagination) : updater;
						updateParam({ page: next.pageIndex > 0 ? String(next.pageIndex + 1) : null }, false);
					}}
				/>
			)}

			<GeneratePayoutDialog
				open={generateOpen}
				onOpenChange={setGenerateOpen}
			/>
		</div>
	);
}
