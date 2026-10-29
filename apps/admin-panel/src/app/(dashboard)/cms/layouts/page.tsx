"use client";

import { useDeleteLayout, useLayouts } from "@/lib/queries/layouts";
import {
	Button,
	DataTable,
	EmptyState,
	FiltersBar,
	Skeleton,
	StatusBadge,
} from "@materialhub/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { LayoutDashboard, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

interface Layout {
	id: string;
	title: Record<string, string>;
	slug: string;
	status: string;
	updated_at: string;
	vendor_id: string | null;
	vendor?: { id: string; name: string; slug: string } | null;
}

const STATUS_OPTIONS = [
	{ label: "Draft", value: "draft" },
	{ label: "Published", value: "published" },
	{ label: "Scheduled", value: "scheduled" },
	{ label: "Archived", value: "archived" },
];

const VENDOR_OPTIONS = [{ label: "Admin only", value: "null" }];

function formatDate(iso: string) {
	return new Date(iso).toLocaleDateString("en-AE", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

export default function LayoutsPage() {
	const router = useRouter();
	const searchParams = useSearchParams();

	const statusFilter = searchParams.get("status") ?? "__all__";
	const vendorFilter = searchParams.get("vendor_id") ?? "__all__";
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

	const { data, isLoading } = useLayouts({
		status: statusFilter === "__all__" ? undefined : statusFilter,
		vendor_id: vendorFilter === "__all__" ? undefined : vendorFilter,
		page,
		limit: pagination.pageSize,
	});
	const { mutate: deleteLayout } = useDeleteLayout();

	const layouts: Layout[] = data?.data ?? data?.items ?? [];
	const total: number = data?.total ?? 0;
	const pageCount = Math.ceil(total / pagination.pageSize) || 1;

	const columns: ColumnDef<Layout>[] = [
		{
			accessorKey: "title",
			header: "Title",
			cell: ({ row }) => (
				<span className="font-medium text-cacao">
					{row.original.title?.en ?? "—"}
				</span>
			),
		},
		{
			accessorKey: "slug",
			header: "Slug",
			cell: ({ row }) => (
				<span className="font-mono text-sm text-taupe">
					{row.original.slug}
				</span>
			),
		},
		{
			accessorKey: "vendor",
			header: "Vendor",
			cell: ({ row }) => {
				const v = row.original.vendor;
				if (!v) return <span className="text-sm text-taupe">—</span>;
				return (
					<span className="text-sm text-cacao">
						{v.name}
						<span className="ml-1 text-taupe text-xs">({v.slug})</span>
					</span>
				);
			},
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => <StatusBadge status={row.original.status} />,
		},
		{
			accessorKey: "updated_at",
			header: "Updated",
			cell: ({ row }) => formatDate(row.original.updated_at),
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }) => (
				<div className="flex items-center gap-2 justify-end">
					<button
						type="button"
						className="p-1.5 rounded hover:bg-pearl/100 text-taupe hover:text-cacao"
						onClick={(e) => {
							e.stopPropagation();
							router.push(`/cms/layouts/${row.original.id}/edit`);
						}}
						aria-label="Edit layout"
						title="Edit layout"
					>
						<Pencil size={15} />
					</button>
					<button
						type="button"
						className="p-1.5 rounded hover:bg-red-50 text-taupe hover:text-red-600"
						onClick={(e) => {
							e.stopPropagation();
							if (
								confirm(
									`Delete layout "${row.original.title?.en ?? row.original.slug}"?`,
								)
							) {
								deleteLayout(row.original.id);
							}
						}}
						aria-label="Delete layout"
						title="Delete layout"
					>
						<Trash2 size={15} />
					</button>
				</div>
			),
		},
	];

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<div className="flex items-baseline gap-2">
						<h1 className="text-2xl font-bold text-cacao">Layouts</h1>
						{!isLoading && total > 0 && (
							<span className="text-sm text-taupe">
								({total.toLocaleString("en-AE")})
							</span>
						)}
					</div>
					<p className="text-taupe text-sm mt-1">
						Manage homepage and page layouts with sections.
					</p>
				</div>
				<Button onClick={() => router.push("/cms/layouts/new")}>
					<Plus size={16} className="mr-1.5" />
					Create Layout
				</Button>
			</div>

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
						key: "ownership",
						label: "Ownership",
						options: VENDOR_OPTIONS,
						value: vendorFilter,
						onChange: (v) => updateParam({ vendor_id: v }),
					},
				]}
			/>

			{isLoading ? (
				<div className="space-y-2">
					{Array.from({ length: 6 }, (_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list, no reordering
						<Skeleton key={i} className="h-12 w-full rounded-lg" />
					))}
				</div>
			) : layouts.length === 0 ? (
				<div className="rounded-xl border border-stone-200 bg-linen">
					<EmptyState
						icon={<LayoutDashboard size={28} />}
						title={
							statusFilter !== "__all__" || vendorFilter !== "__all__"
								? "No layouts match these filters"
								: "No layouts yet"
						}
						description={
							statusFilter !== "__all__" || vendorFilter !== "__all__"
								? "Try clearing filters or switching the status to see other layouts."
								: "Layouts let you compose storefront pages from sections like carousels, banners, and product rails."
						}
						action={{
							label:
								statusFilter !== "__all__" || vendorFilter !== "__all__"
									? "Clear filters"
									: "Create your first layout",
							onClick: () => {
								if (
									statusFilter !== "__all__" ||
									vendorFilter !== "__all__"
								) {
									updateParam({ status: null, vendor_id: null });
								} else {
									router.push("/cms/layouts/new");
								}
							},
						}}
					/>
				</div>
			) : (
				<DataTable
					columns={columns}
					data={layouts}
					isLoading={isLoading}
					pagination={pagination}
					pageCount={pageCount}
					totalCount={total}
					itemLabel="layouts"
					onPaginationChange={(updater) => {
						const next = typeof updater === "function" ? updater(pagination) : updater;
						updateParam({ page: next.pageIndex > 0 ? String(next.pageIndex + 1) : null }, false);
					}}
				/>
			)}
		</div>
	);
}
