"use client";

import { formatAed } from "@/lib/money";
import {
	type GiftBoxDetail,
	useDeleteGiftBox,
	useGiftBoxes,
} from "@/lib/queries/gifting";
import { Button, DataTable, toast } from "@materialhub/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";

export default function GiftBoxesPage() {
	const { data, isLoading } = useGiftBoxes();
	const { mutate: deleteBox } = useDeleteGiftBox();

	const rows: GiftBoxDetail[] = data?.items ?? [];

	const columns: ColumnDef<GiftBoxDetail>[] = [
		{
			id: "name",
			header: "Name",
			cell: ({ row }) => (
				<span className="font-medium text-cacao">{row.original.box.name}</span>
			),
		},
		{
			id: "style",
			header: "Style",
			cell: ({ row }) => (
				<span className="text-taupe text-sm">
					{row.original.box.style?.name ?? "—"}
				</span>
			),
		},
		{
			id: "occasions",
			header: "Occasions",
			cell: ({ row }) => (
				<span className="text-taupe text-sm">
					{row.original.box.occasions?.length ?? 0}
				</span>
			),
		},
		{
			id: "total",
			header: "Total",
			cell: ({ row }) => (
				<span className="text-taupe text-sm">
					{formatAed(row.original.price.total)}
				</span>
			),
		},
		{
			id: "is_active",
			header: "Status",
			cell: ({ row }) => (
				<span
					className={`rounded-full px-2 py-0.5 text-xs ${
						row.original.box.is_active
							? "bg-green-100 text-green-700"
							: "bg-red-100 text-red-700"
					}`}
				>
					{row.original.box.is_active ? "Active" : "Inactive"}
				</span>
			),
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }) => (
				<div className="flex justify-end gap-1">
					<Button variant="ghost" size="sm" asChild className="p-2">
						<Link href={`/gifting/boxes/${row.original.box.id}`}>
							<Pencil size={15} />
						</Link>
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className="p-2 text-red-600"
						onClick={() => {
							if (!confirm(`Delete "${row.original.box.name}"?`)) return;
							deleteBox(row.original.box.id, {
								onSuccess: () => toast({ title: "Deleted" }),
								onError: (e: any) =>
									toast({
										title: "Error",
										description: e?.response?.data?.message ?? "Delete failed.",
										variant: "destructive",
									}),
							});
						}}
					>
						<Trash2 size={15} />
					</Button>
				</div>
			),
		},
	];

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-cacao mb-1">Gift Boxes</h1>
					<p className="text-taupe text-sm">
						Predefined gift boxes: a style + occasions + curated products.
					</p>
				</div>
				<Button asChild>
					<Link href="/gifting/boxes/new">
						<Plus size={16} className="mr-1.5" />
						New Gift Box
					</Link>
				</Button>
			</div>

			<DataTable
				columns={columns}
				data={rows}
				isLoading={isLoading}
				totalCount={rows.length}
				itemLabel="boxes"
			/>
		</div>
	);
}
