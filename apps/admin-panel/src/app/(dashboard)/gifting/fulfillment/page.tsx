"use client";

import {
	FULFILLMENT_STATUS_CLASSES,
	FULFILLMENT_STATUS_LABELS,
	type FulfillmentStatus,
	type GiftFulfillmentOrder,
	QUEUE_FILTER_STATUSES,
	useGiftFulfillmentQueue,
} from "@/lib/queries/gift-fulfillment";
import { Button, DataTable } from "@materialhub/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

function StatusPill({ status }: { status: FulfillmentStatus }) {
	return (
		<span
			className={`rounded-full px-2 py-0.5 text-xs ${FULFILLMENT_STATUS_CLASSES[status]}`}
		>
			{FULFILLMENT_STATUS_LABELS[status]}
		</span>
	);
}

export default function GiftFulfillmentQueuePage() {
	const [status, setStatus] = useState<FulfillmentStatus | undefined>(
		"awaiting_items",
	);
	const { data, isLoading } = useGiftFulfillmentQueue(status);

	const rows: GiftFulfillmentOrder[] = data?.items ?? [];

	const columns: ColumnDef<GiftFulfillmentOrder>[] = [
		{
			id: "box",
			header: "Gift box",
			cell: ({ row }) => (
				<Link
					href={`/gifting/fulfillment/${row.original.id}`}
					className="font-medium text-cacao hover:underline"
				>
					{row.original.box_name_snapshot}
				</Link>
			),
		},
		{
			id: "recipient",
			header: "Recipient",
			cell: ({ row }) => (
				<span className="text-taupe text-sm">
					{row.original.recipient_name ?? "—"}
				</span>
			),
		},
		{
			id: "status",
			header: "Status",
			cell: ({ row }) => <StatusPill status={row.original.fulfillment_status} />,
		},
		{
			id: "created_at",
			header: "Created",
			cell: ({ row }) => (
				<span className="text-taupe text-sm">
					{new Date(row.original.created_at).toLocaleDateString()}
				</span>
			),
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }) => (
				<div className="flex justify-end">
					<Button variant="ghost" size="sm" asChild className="p-2">
						<Link href={`/gifting/fulfillment/${row.original.id}`}>
							<ChevronRight size={16} className="text-taupe" />
						</Link>
					</Button>
				</div>
			),
		},
	];

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold text-cacao mb-1">
					Gift Fulfillment
				</h1>
				<p className="text-taupe text-sm">
					Receive vendor parcels at the hub, assemble gift boxes, then dispatch
					and deliver.
				</p>
			</div>

			<div className="flex flex-wrap gap-2">
				<button
					type="button"
					onClick={() => setStatus(undefined)}
					className={`rounded-full border px-3 py-1 text-sm transition ${
						status === undefined
							? "border-primary bg-primary/10 text-primary"
							: "border-gray-300 text-taupe hover:bg-muted/60"
					}`}
				>
					All
				</button>
				{QUEUE_FILTER_STATUSES.map((s) => (
					<button
						key={s}
						type="button"
						onClick={() => setStatus(s)}
						className={`rounded-full border px-3 py-1 text-sm transition ${
							status === s
								? "border-primary bg-primary/10 text-primary"
								: "border-gray-300 text-taupe hover:bg-muted/60"
						}`}
					>
						{FULFILLMENT_STATUS_LABELS[s]}
					</button>
				))}
			</div>

			<DataTable
				columns={columns}
				data={rows}
				isLoading={isLoading}
				totalCount={rows.length}
				itemLabel="orders"
			/>
		</div>
	);
}
