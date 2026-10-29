"use client";

import { QueryError } from "@/components/query-error";
import { useAdminCollabs } from "@/lib/queries/collabs";
import { useVendors } from "@/lib/queries/vendors";
import { DataTable, FiltersBar, StatusBadge } from "@materialhub/ui";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";

interface AdminCollab {
	id: string;
	title: string;
	type: string;
	status: string;
	vendor_id: string;
	vendor_name: string | null;
	seeded_product_id: string | null;
	seeded_product_name: string | null;
	slots_total: number;
	slots_filled: number;
	created_at: string;
}

const STATUS_OPTIONS = [
	{ label: "Draft", value: "draft" },
	{ label: "Open", value: "open" },
	{ label: "Filled", value: "filled" },
	{ label: "Completed", value: "completed" },
	{ label: "Cancelled", value: "cancelled" },
	{ label: "Expired", value: "expired" },
];

const TYPE_OPTIONS = [
	{ label: "Product Seeding", value: "product_seeding" },
	{ label: "Paid Campaign", value: "paid_campaign" },
	{ label: "Event Appearance", value: "event_appearance" },
];

function formatDate(iso: string) {
	return new Date(iso).toLocaleDateString("en-AE", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

export default function CollabsPage() {
	const router = useRouter();
	const searchParams = useSearchParams();

	const statusFilter = searchParams.get("status") ?? "__all__";
	const typeFilter = searchParams.get("type") ?? "__all__";
	const vendorFilter = searchParams.get("vendor_id") ?? "__all__";
	const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
	const pagination = useMemo(() => ({ pageIndex: page - 1, pageSize: 20 }), [page]);

	const updateParam = (updates: Record<string, string | null | undefined>, resetPage = true) => {
		const params = new URLSearchParams(searchParams.toString());
		for (const [key, value] of Object.entries(updates)) {
			if (value && value !== "__all__") params.set(key, value);
			else params.delete(key);
		}
		if (resetPage && !updates.page) params.delete("page");
		const qs = params.toString();
		router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
	};

	const { data, isLoading, isError, error, refetch } = useAdminCollabs({
		status: statusFilter,
		type: typeFilter,
		vendorId: vendorFilter === "__all__" ? undefined : vendorFilter,
		page,
		limit: pagination.pageSize,
	});

	const { data: vendorsData } = useVendors({ limit: 200 });
	const vendorOptions = useMemo(() => {
		const vendors = vendorsData?.items ?? vendorsData?.data ?? [];
		// biome-ignore lint/suspicious/noExplicitAny: loosely-typed API response
		return vendors.map((v: any) => ({ label: v.name, value: v.id }));
	}, [vendorsData]);

	const collabs: AdminCollab[] = data?.items ?? [];
	const total: number = data?.total ?? 0;
	const pageCount = Math.ceil(total / pagination.pageSize) || 1;

	const columns: ColumnDef<AdminCollab>[] = [
		{
			accessorKey: "title",
			header: "Title",
			cell: ({ row }) => (
				<Link
					href={`/collabs/${row.original.id}`}
					className="font-medium text-cacao hover:text-primary hover:underline"
				>
					{row.original.title}
				</Link>
			),
		},
		{
			accessorKey: "vendor_name",
			header: "Vendor",
			cell: ({ row }) => row.original.vendor_name ?? "—",
		},
		{
			accessorKey: "type",
			header: "Type",
			cell: ({ row }) =>
				TYPE_OPTIONS.find((t) => t.value === row.original.type)?.label ?? row.original.type,
		},
		{
			accessorKey: "seeded_product_name",
			header: "Product",
			cell: ({ row }) => row.original.seeded_product_name ?? "—",
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => <StatusBadge status={row.original.status} />,
		},
		{
			id: "slots",
			header: "Slots",
			cell: ({ row }) => `${row.original.slots_filled} / ${row.original.slots_total}`,
		},
		{
			accessorKey: "created_at",
			header: "Created",
			cell: ({ row }) => formatDate(row.original.created_at),
		},
	];

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold text-cacao mb-1">Collaborations</h1>
				<p className="text-taupe text-sm">
					Every creator collaboration opportunity across all vendors.
				</p>
			</div>

			<div className="space-y-4">
				<FiltersBar
					filters={[
						{
							key: "status",
							label: "Status",
							options: STATUS_OPTIONS,
							value: statusFilter,
							onChange: (v) => updateParam({ status: v }),
						},
						{
							key: "type",
							label: "Type",
							options: TYPE_OPTIONS,
							value: typeFilter,
							onChange: (v) => updateParam({ type: v }),
						},
						{
							key: "vendor",
							label: "Vendor",
							options: vendorOptions,
							value: vendorFilter,
							onChange: (v) => updateParam({ vendor_id: v }),
						},
					]}
				/>
				{isError ? (
					<QueryError title="Could not load collabs." error={error} onRetry={() => refetch()} />
				) : (
					<DataTable
						columns={columns}
						data={collabs}
						isLoading={isLoading}
						pagination={pagination}
						pageCount={pageCount}
						totalCount={total}
						itemLabel="collabs"
						onPaginationChange={(updater) => {
							const next = typeof updater === "function" ? updater(pagination) : updater;
							updateParam({ page: next.pageIndex > 0 ? String(next.pageIndex + 1) : null }, false);
						}}
					/>
				)}
			</div>
		</div>
	);
}
