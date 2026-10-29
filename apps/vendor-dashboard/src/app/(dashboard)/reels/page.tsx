"use client";

import type { MyReelSummary } from "@/lib/api/reels";
import { useDeleteReel, useMyReels } from "@/lib/queries/reels-studio";
import { Badge, Button, DataTable, StatusBadge } from "@materialhub/ui";
import { PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";

function formatDate(iso: string | null | undefined) {
	if (!iso) return "-";
	return new Date(iso).toLocaleDateString("en-AE", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

export default function ReelsPage() {
	const [cursor, setCursor] = useState<string | undefined>();
	const { data, isLoading } = useMyReels({ cursor, limit: 20 });
	const deleteReel = useDeleteReel();
	const reels = data?.items ?? [];

	const columns = [
		{
			id: "reel",
			header: "Reel",
			cell: ({
				row: { original: reel },
			}: { row: { original: MyReelSummary } }) => (
				<div className="flex items-center gap-3">
					{reel.thumbnail_url ? (
						// eslint-disable-next-line @next/next/no-img-element
						<img
							src={reel.thumbnail_url}
							alt=""
							className="h-16 w-10 rounded object-cover"
						/>
					) : (
						<div className="h-16 w-10 rounded bg-gray-100" />
					)}
					<div className="min-w-0">
						<div className="truncate text-sm font-medium">
							{reel.caption || "Untitled reel"}
						</div>
						<div className="text-xs text-muted-foreground">
							{reel.video_duration_seconds}s
						</div>
					</div>
				</div>
			),
		},
		{
			id: "status",
			header: "Status",
			cell: ({
				row: { original: reel },
			}: { row: { original: MyReelSummary } }) => (
				<div className="space-y-1">
					<StatusBadge status={reel.status} />
					{reel.rejection_reason && (
						<div className="text-xs text-red-600">{reel.rejection_reason}</div>
					)}
				</div>
			),
		},
		{
			id: "tags",
			header: "Tags",
			cell: ({
				row: { original: reel },
			}: { row: { original: MyReelSummary } }) => (
				<Badge variant="secondary">{reel.tags?.length ?? 0}</Badge>
			),
		},
		{
			id: "created",
			header: "Created",
			cell: ({
				row: { original: reel },
			}: { row: { original: MyReelSummary } }) => (
				<span className="text-sm text-muted-foreground">
					{formatDate(reel.created_at)}
				</span>
			),
		},
		{
			id: "actions",
			header: "",
			cell: ({
				row: { original: reel },
			}: { row: { original: MyReelSummary } }) => (
				<div className="flex justify-end gap-2">
					<Button variant="ghost" size="sm" asChild>
						<Link href={`/reels/${reel.id}/edit`}>
							<PencilSimple size={14} className="mr-1" />
							Edit
						</Link>
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className="text-destructive hover:text-destructive"
						onClick={() => {
							if (confirm("Delete this reel?")) deleteReel.mutate(reel.id);
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
					<h1 className="text-2xl font-bold text-gray-900">Reels</h1>
					<p className="text-sm text-gray-500">
						Create reels and tag products from your catalog
					</p>
				</div>
				<Button asChild>
					<Link href="/reels/upload">
						<Plus size={16} className="mr-2" />
						New Reel
					</Link>
				</Button>
			</div>

			<DataTable
				columns={columns}
				data={reels}
				isLoading={isLoading}
				rowId="id"
			/>

			<div className="flex items-center justify-between pt-2">
				<span className="text-sm text-muted-foreground">
					Total: {reels.length} {reels.length === 1 ? "reel" : "reels"}
				</span>
				<div className="flex justify-end gap-2">
					<Button
						size="sm"
						variant="outline"
						disabled={!cursor}
						onClick={() => setCursor(undefined)}
					>
						First page
					</Button>
					<Button
						size="sm"
						variant="outline"
						disabled={!data?.nextCursor}
						onClick={() => setCursor(data?.nextCursor ?? undefined)}
					>
						Next
					</Button>
				</div>
			</div>
		</div>
	);
}
