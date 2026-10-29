"use client";

import { useReceiveReturn, useVendorReturns } from "@/lib/queries/returns";
import {
	Button,
	DataTable,
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	EmptyState,
	FiltersBar,
	StatusBadge,
} from "@materialhub/ui";
import { ArrowCounterClockwise } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

const STATUS_OPTIONS = [
	{ label: "All Statuses", value: "" },
	{ label: "Requested", value: "requested" },
	{ label: "Approved", value: "approved" },
	{ label: "Shipped back", value: "shipped_back" },
	{ label: "Received", value: "received" },
	{ label: "Refunded", value: "refunded" },
	{ label: "Rejected", value: "rejected" },
];

function formatDate(iso: string) {
	return new Date(iso).toLocaleDateString("en-AE", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

export default function ReturnsPage() {
	const router = useRouter();
	const searchParams = useSearchParams();

	const status = searchParams.get("status") ?? "";
	const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
	const [receiveTarget, setReceiveTarget] = useState<any | null>(null);
	const [restock, setRestock] = useState(false);

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

	const { data, isLoading } = useVendorReturns({
		status: status || undefined,
		page,
		limit: 20,
	});

	const { mutate: receiveReturn, isPending: receiving } = useReceiveReturn();

	const returns: any[] = data?.items ?? [];
	const total: number = data?.total ?? 0;
	const totalPages = Math.ceil(total / 20);

	const columns = [
		{
			id: "return_id",
			header: "Return ID",
			cell: ({ row: { original: row } }: { row: { original: any } }) => (
				<span className="text-sm font-medium">
					{row.return_number ?? row.id?.slice(0, 8)}
				</span>
			),
		},
		{
			id: "order_number",
			header: "Order",
			cell: ({ row: { original: row } }: { row: { original: any } }) => {
				const num = row.order?.order_number ?? row.order_number;
				return (
					<Link
						href={`/orders/${row.order_id}`}
						className="text-sm hover:underline text-primary"
					>
						{num ? `#${num}` : `${row.order_id?.slice(0, 8)}…`}
					</Link>
				);
			},
		},
		{
			id: "product",
			header: "Product",
			cell: ({ row: { original: row } }: { row: { original: any } }) => {
				const names = (row.returnItems ?? [])
					.map((ri: any) => ri.orderItem?.product_name)
					.filter((n: any): n is string => !!n);
				const text =
					names.length === 0
						? "—"
						: names.length === 1
							? names[0]
							: `${names[0]} +${names.length - 1} more`;
				return <span className="text-sm max-w-xs truncate block">{text}</span>;
			},
		},
		{
			id: "reason",
			header: "Reason",
			cell: ({ row: { original: row } }: { row: { original: any } }) => (
				<span className="text-sm capitalize">
					{row.reason?.replace(/_/g, " ") ?? "—"}
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
		{
			id: "created_at",
			header: "Date",
			cell: ({ row: { original: row } }: { row: { original: any } }) => (
				<span className="text-sm text-muted-foreground">
					{formatDate(row.created_at)}
				</span>
			),
		},
		{
			id: "actions",
			header: "Actions",
			cell: ({ row: { original: row } }: { row: { original: any } }) => (
				<div className="flex gap-2 justify-end">
					{(row.status === "approved" || row.status === "shipped_back") && (
						<Button
							size="sm"
							variant="outline"
							disabled={receiving}
							onClick={() => {
								setRestock(false);
								setReceiveTarget(row);
							}}
						>
							Mark Received
						</Button>
					)}
				</div>
			),
		},
	];

	return (
		<div className="space-y-4">
			<div>
				<h1 className="text-2xl font-bold text-gray-900">Returns</h1>
				<p className="text-sm text-gray-500">
					Review and process return requests
				</p>
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

			{!isLoading && returns.length === 0 ? (
				<EmptyState
					icon={<ArrowCounterClockwise size={40} />}
					title="No return requests"
					description="Return requests from customers will appear here."
				/>
			) : (
				<>
					<Dialog
						open={!!receiveTarget}
						onOpenChange={(o) => !o && setReceiveTarget(null)}
					>
						<DialogContent className="sm:max-w-sm">
							<DialogHeader>
								<DialogTitle>
									Mark return received —{" "}
									{receiveTarget?.return_number ??
										receiveTarget?.id?.slice(0, 8)}
								</DialogTitle>
							</DialogHeader>
							<div className="py-2 space-y-2">
								<p className="text-sm text-muted-foreground">
									Confirm you've received the returned items. Optionally restock
									to add them back to inventory.
								</p>
								<label className="flex items-center gap-2 text-sm">
									<input
										type="checkbox"
										checked={restock}
										onChange={(e) => setRestock(e.target.checked)}
									/>
									Restock items into inventory
								</label>
							</div>
							<DialogFooter>
								<Button
									variant="outline"
									onClick={() => setReceiveTarget(null)}
								>
									Cancel
								</Button>
								<Button
									disabled={receiving}
									onClick={() => {
										if (!receiveTarget) return;
										receiveReturn(
											{ id: receiveTarget.id, restock },
											{ onSuccess: () => setReceiveTarget(null) },
										);
									}}
								>
									{receiving ? "Saving..." : "Confirm received"}
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
					<DataTable
						columns={columns}
						data={returns}
						isLoading={isLoading}
						rowId="id"
					/>
					<div className="flex items-center justify-between pt-2">
						<span className="text-sm text-muted-foreground">
							{totalPages > 1
								? `Page ${page} of ${totalPages} (${total} returns)`
								: `Total: ${total} ${total === 1 ? "return" : "returns"}`}
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
