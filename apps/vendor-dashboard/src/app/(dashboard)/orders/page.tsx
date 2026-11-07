"use client";

import { useUpdateOrderStatus, useVendorOrders } from "@/lib/queries/orders";
import {
	Button,
	DataTable,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	EmptyState,
	FiltersBar,
	StatusBadge,
} from "@materialhub/ui";
import { CaretDown, ShoppingCart } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const STATUS_OPTIONS = [
	{ label: "All Statuses", value: "" },
	{ label: "Confirmed", value: "confirmed" },
	{ label: "Processing", value: "processing" },
	{ label: "Ready to Ship", value: "ready_to_ship" },
	{ label: "Shipped", value: "shipped" },
	{ label: "Delivered", value: "delivered" },
	{ label: "Cancelled", value: "cancelled" },
];

const STATUS_TRANSITIONS: Record<string, string[]> = {
	confirmed: ["processing"],
	processing: ["ready_to_ship"],
	ready_to_ship: ["shipped"],
};

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

export default function OrdersPage() {
	const router = useRouter();
	const searchParams = useSearchParams();

	const status = searchParams.get("status") ?? "";
	const searchParam = searchParams.get("search") ?? "";
	const page = Math.max(1, Number(searchParams.get("page") ?? "1"));

	const [search, setSearch] = useState(searchParam);
	useEffect(() => {
		setSearch(searchParam);
	}, [searchParam]);

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

	const { data, isLoading } = useVendorOrders({
		status: status || undefined,
		search: searchParam || undefined,
		page,
		limit: 20,
	});

	const { mutate: updateStatus } = useUpdateOrderStatus();

	// Map API fields — vendor orders may come as array or {items, total}
	const rawOrders: any[] = Array.isArray(data) ? data : (data?.items ?? []);
	const orders: any[] = rawOrders.map((o: any) => ({
		...o,
		order_number: o.vendor_order_number || o.order_number,
		total: o.vendor_total ?? o.subtotal ?? o.total ?? 0,
		items_count: o.items?.length ?? o.items_count ?? 0,
	}));
	const total: number = data?.total ?? rawOrders.length;
	const totalPages = Math.ceil(total / 20);

	const columns = [
		{
			id: "order_number",
			header: "Order",
			cell: ({ row }: { row: { original: any } }) => {
				const o = row.original;
				return (
					<Link
						href={`/orders/${o.id}`}
						className="font-medium text-sm hover:underline"
					>
						{o.order_number}
					</Link>
				);
			},
		},
		{
			id: "items_count",
			header: "Items",
			cell: ({ row }: { row: { original: any } }) => {
				const o = row.original;
				return (
					<span className="text-sm">
						{o.items_count ?? o.items?.length ?? "—"}
					</span>
				);
			},
		},
		{
			id: "status",
			header: "Status",
			cell: ({ row }: { row: { original: any } }) => (
				<StatusBadge status={row.original.status} />
			),
		},
		{
			id: "total",
			header: "Total",
			cell: ({ row }: { row: { original: any } }) => {
				const o = row.original;
				return (
					<span className="text-sm font-medium">
						{o.total != null ? formatCurrency(o.total) : "—"}
					</span>
				);
			},
		},
		{
			id: "created_at",
			header: "Date",
			cell: ({ row }: { row: { original: any } }) => (
				<span className="text-sm text-muted-foreground">
					{formatDate(row.original.created_at)}
				</span>
			),
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }: { row: { original: any } }) => {
				const o = row.original;
				const nextStatuses = STATUS_TRANSITIONS[o.status] ?? [];
				return (
					<div className="flex gap-2 justify-end">
						<Button variant="ghost" size="sm" asChild>
							<Link href={`/orders/${o.id}`}>View</Link>
						</Button>
						{nextStatuses.length > 0 && (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant="outline" size="sm">
										Update Status <CaretDown size={14} className="ml-1" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									{nextStatuses.map((s) => (
										<DropdownMenuItem
											key={s}
											onClick={() => updateStatus({ id: o.id, status: s })}
										>
											Mark as {s.replace(/_/g, " ")}
										</DropdownMenuItem>
									))}
								</DropdownMenuContent>
							</DropdownMenu>
						)}
					</div>
				);
			},
		},
	];

	return (
		<div className="space-y-4">
			<div>
				<h1 className="text-2xl font-bold text-gray-900">Orders</h1>
				<p className="text-sm text-gray-500">
					Manage and fulfil your customer orders
				</p>
			</div>

			<FiltersBar
				search={{
					placeholder: "Search by order number…",
					value: search,
					onChange: (v: string) => {
						setSearch(v);
						updateParam({ search: v || null });
					},
				}}
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

			{!isLoading && orders.length === 0 ? (
				<EmptyState
					icon={<ShoppingCart size={40} />}
					title="No orders yet"
					description="When customers place orders, they will appear here."
				/>
			) : (
				<>
					<DataTable
						columns={columns}
						data={orders}
						isLoading={isLoading}
						rowId="id"
					/>
					<div className="flex items-center justify-between pt-2">
						<span className="text-sm text-muted-foreground">
							{totalPages > 1
								? `Page ${page} of ${totalPages} (${total} orders)`
								: `Total: ${total} ${total === 1 ? "order" : "orders"}`}
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
