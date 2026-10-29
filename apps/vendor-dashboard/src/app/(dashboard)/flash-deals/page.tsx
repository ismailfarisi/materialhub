"use client";

import {
	useDeleteVendorFlashDeal,
	useVendorFlashDeals,
} from "@/lib/queries/promotions";
import { Badge, Button, DataTable, StatusBadge } from "@materialhub/ui";
import { Pencil, Plus, Trash } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

function formatPrice(fils: number | null | undefined) {
	if (fils == null) return "—";
	return `AED ${(fils / 100).toLocaleString("en-AE", { minimumFractionDigits: 2 })}`;
}

function formatDate(iso: string | null | undefined) {
	if (!iso) return "—";
	return new Date(iso).toLocaleDateString("en-AE", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

function calcDiscount(
	original: number | null | undefined,
	deal: number | null | undefined,
) {
	if (!original || !deal || original === 0) return null;
	return Math.round(((original - deal) / original) * 100);
}

function dealStatus(row: any): string {
	const now = new Date();
	const start = row.starts_at ? new Date(row.starts_at) : null;
	const end = row.expires_at ? new Date(row.expires_at) : null;
	if (!row.is_active) return "inactive";
	if (end && end < now) return "expired";
	if (start && start > now) return "scheduled";
	return "active";
}

export default function FlashDealsPage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const page = Math.max(1, Number(searchParams.get("page") ?? "1"));

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

	const { data, isLoading } = useVendorFlashDeals({ page, limit: 20 });
	const { mutate: deleteDeal } = useDeleteVendorFlashDeal();

	const deals: any[] = data?.items ?? [];
	const total: number = data?.total ?? 0;
	const totalPages = Math.ceil(total / 20);

	const columns = [
		{
			id: "product",
			header: "Product",
			cell: ({ row: { original: row } }: { row: { original: any } }) => (
				<span className="text-sm font-medium">
					{row.product?.name ?? row.product_id}
				</span>
			),
		},
		{
			id: "deal_price",
			header: "Deal Price",
			cell: ({ row: { original: row } }: { row: { original: any } }) => (
				<span className="text-sm font-semibold text-green-700">
					{formatPrice(row.deal_price)}
				</span>
			),
		},
		{
			id: "original_price",
			header: "Original Price",
			cell: ({ row: { original: row } }: { row: { original: any } }) => (
				<span className="text-sm text-muted-foreground line-through">
					{formatPrice(row.original_price)}
				</span>
			),
		},
		{
			id: "discount_pct",
			header: "Discount",
			cell: ({ row: { original: row } }: { row: { original: any } }) => {
				const pct = calcDiscount(row.original_price, row.deal_price);
				return pct != null ? (
					<Badge className="bg-red-100 text-red-700 border-red-200 text-xs">
						-{pct}%
					</Badge>
				) : (
					<span className="text-muted-foreground text-sm">—</span>
				);
			},
		},
		{
			id: "quantity_limit",
			header: "Qty Limit",
			cell: ({ row: { original: row } }: { row: { original: any } }) => (
				<span className="text-sm text-muted-foreground">
					{row.quantity_limit != null ? row.quantity_limit : "Unlimited"}
				</span>
			),
		},
		{
			id: "status",
			header: "Status",
			cell: ({ row: { original: row } }: { row: { original: any } }) => (
				<StatusBadge status={dealStatus(row)} />
			),
		},
		{
			id: "schedule",
			header: "Schedule",
			cell: ({ row: { original: row } }: { row: { original: any } }) => (
				<span className="text-xs text-muted-foreground">
					{formatDate(row.starts_at)} – {formatDate(row.expires_at)}
				</span>
			),
		},
		{
			id: "actions",
			header: "",
			cell: ({ row: { original: row } }: { row: { original: any } }) => (
				<div className="flex gap-2 justify-end">
					<Button variant="ghost" size="sm" asChild>
						<Link href={`/flash-deals/${row.id}`}>
							<Pencil size={14} className="mr-1" />
							Pencil
						</Link>
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className="text-destructive hover:text-destructive"
						onClick={() => {
							if (confirm(`Delete this flash deal?`)) {
								deleteDeal(row.id);
							}
						}}
					>
						<Trash size={14} className="mr-1" />
						Delete
					</Button>
				</div>
			),
		},
	];

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-gray-900">Flash Deals</h1>
					<p className="text-sm text-gray-500">
						Time-limited discounts on your products
					</p>
				</div>
				<Button asChild>
					<Link href="/flash-deals/new">
						<Plus size={16} className="mr-2" />
						New Flash Deal
					</Link>
				</Button>
			</div>

			<DataTable
				columns={columns}
				data={deals}
				isLoading={isLoading}
				rowId="id"
			/>

			<div className="flex items-center justify-between pt-2">
				<span className="text-sm text-muted-foreground">
					{totalPages > 1
						? `Page ${page} of ${totalPages} (${total} deals)`
						: `Total: ${total} ${total === 1 ? "deal" : "deals"}`}
				</span>
				{totalPages > 1 && (
					<div className="flex gap-2">
						<Button
							size="sm"
							variant="outline"
							disabled={page === 1}
							onClick={() => updateParam({ page: String(page - 1) })}
						>
							Previous
						</Button>
						<Button
							size="sm"
							variant="outline"
							disabled={page >= totalPages}
							onClick={() => updateParam({ page: String(page + 1) })}
						>
							Next
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
