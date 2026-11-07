"use client";

import {
	useDeleteVendorCoupon,
	useVendorCoupons,
} from "@/lib/queries/promotions";
import { Badge, Button, DataTable, StatusBadge } from "@materialhub/ui";
import { Pencil, Plus, Trash } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

function formatDate(iso: string | null | undefined) {
	if (!iso) return "—";
	return new Date(iso).toLocaleDateString("en-AE", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

function formatDiscount(type: string, value: number) {
	if (type === "percentage") return `${value}%`;
	if (type === "fixed_amount")
		return `AED ${(value / 100).toLocaleString("en-AE", { minimumFractionDigits: 2 })}`;
	if (type === "free_shipping") return "Free Shipping";
	return `${value}`;
}

export default function CouponsPage() {
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

	const { data, isLoading } = useVendorCoupons({ page, limit: 20 });
	const { mutate: deleteCoupon } = useDeleteVendorCoupon();

	const coupons: any[] = data?.items ?? [];
	const total: number = data?.total ?? 0;
	const totalPages = Math.ceil(total / 20);

	const columns = [
		{
			id: "code",
			header: "Code",
			cell: ({ row: { original: row } }: { row: { original: any } }) => (
				<span className="font-mono font-semibold text-sm tracking-wide">
					{row.code}
				</span>
			),
		},
		{
			id: "name",
			header: "Name",
			cell: ({ row: { original: row } }: { row: { original: any } }) => (
				<span className="text-sm">{row.name ?? "—"}</span>
			),
		},
		{
			id: "type",
			header: "Type",
			cell: ({ row: { original: row } }: { row: { original: any } }) => (
				<Badge variant="outline" className="text-xs capitalize">
					{row.type?.replace(/_/g, " ") ?? "—"}
				</Badge>
			),
		},
		{
			id: "discount",
			header: "Discount",
			cell: ({ row: { original: row } }: { row: { original: any } }) => (
				<span className="text-sm font-medium">
					{row.type && row.discount_value != null
						? formatDiscount(row.type, row.discount_value)
						: "—"}
				</span>
			),
		},
		{
			id: "usage",
			header: "Usage",
			cell: ({ row: { original: row } }: { row: { original: any } }) => (
				<span className="text-sm text-muted-foreground">
					{row.usage_count ?? 0}
					{row.usage_limit ? ` / ${row.usage_limit}` : ""}
				</span>
			),
		},
		{
			id: "status",
			header: "Status",
			cell: ({ row: { original: row } }: { row: { original: any } }) => (
				<StatusBadge status={row.is_active ? "active" : "inactive"} />
			),
		},
		{
			id: "dates",
			header: "Validity",
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
						<Link href={`/coupons/${row.id}`}>
							<Pencil size={14} className="mr-1" />
							Edit
						</Link>
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className="text-destructive hover:text-destructive"
						onClick={() => {
							if (confirm(`Delete coupon "${row.code}"?`)) {
								deleteCoupon(row.id);
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
					<h1 className="text-2xl font-bold text-gray-900">Coupons</h1>
					<p className="text-sm text-gray-500">
						Manage discount coupons for your store
					</p>
				</div>
				<Button asChild>
					<Link href="/coupons/new">
						<Plus size={16} className="mr-2" />
						New Coupon
					</Link>
				</Button>
			</div>

			<DataTable
				columns={columns}
				data={coupons}
				isLoading={isLoading}
				rowId="id"
			/>

			<div className="flex items-center justify-between pt-2">
				<span className="text-sm text-muted-foreground">
					{totalPages > 1
						? `Page ${page} of ${totalPages} (${total} coupons)`
						: `Total: ${total} ${total === 1 ? "coupon" : "coupons"}`}
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
