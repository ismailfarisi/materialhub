"use client";
import { type BulkJobSummary, useBulkJobs } from "@/lib/queries/bulk";
import { useState } from "react";
import { ImageProgressCell } from "./ImageProgressCell";
import { JobDetailDrawer } from "./JobDetailDrawer";
import { ProgressBar } from "./ProgressBar";

export function jobTypeLabel(jobType: string): string {
	switch (jobType) {
		case "inventory_update":
			return "Inventory update";
		case "catalog_import":
			return "Catalog import";
		default:
			return jobType;
	}
}

interface Props {
	jobType?: string;
	vendorId?: string;
}

export function JobList({ jobType, vendorId }: Props) {
	const { data, isLoading } = useBulkJobs({ jobType, vendorId });
	const [selected, setSelected] = useState<string | null>(null);

	if (isLoading)
		return <div className="p-4 text-sm text-gray-500">Loading…</div>;
	if (!data?.items?.length)
		return <div className="p-4 text-sm text-gray-500">No jobs yet.</div>;

	return (
		<>
			<table className="w-full text-sm" data-stack="md">
				<thead>
					<tr className="border-b text-left text-xs uppercase text-gray-500">
						<th className="py-2">File</th>
						<th>Status</th>
						<th>Progress</th>
						<th>Images</th>
						<th>Started</th>
						<th />
					</tr>
				</thead>
				<tbody>
					{data.items.map((j: BulkJobSummary) => (
						<tr key={j.id} className="border-b hover:bg-gray-50">
							<td data-card-title className="py-2">
								{j.fileName}
							</td>
							<td data-label="Status">
								<StatusBadge status={j.status} />
							</td>
							<td data-label="Progress">
								<ProgressBar value={j.processedRows} max={j.totalRows} />
							</td>
							<td data-label="Images">
								{j.jobType === "catalog_import" ? (
									<ImageProgressCell
										total={j.imagesTotal}
										processed={j.imagesProcessed}
										failed={j.imagesFailed}
									/>
								) : (
									<span className="text-xs text-gray-400">—</span>
								)}
							</td>
							<td data-label="Started" className="text-xs text-gray-600">
								{j.startedAt ? new Date(j.startedAt).toLocaleString() : "—"}
							</td>
							<td>
								<button
									type="button"
									onClick={() => setSelected(j.id)}
									className="text-blue-600 underline"
								>
									Details
								</button>
							</td>
						</tr>
					))}
				</tbody>
			</table>
			<div className="pt-2 text-xs text-gray-500">
				Total: {data.items.length} {data.items.length === 1 ? "job" : "jobs"}
			</div>
			<JobDetailDrawer jobId={selected} onClose={() => setSelected(null)} />
		</>
	);
}

function StatusBadge({ status }: { status: string }) {
	const color: Record<string, string> = {
		pending_upload: "bg-gray-200 text-gray-800",
		queued: "bg-blue-100 text-blue-800",
		running: "bg-blue-200 text-blue-900",
		completed: "bg-green-100 text-green-800",
		completed_with_errors: "bg-amber-100 text-amber-800",
		failed: "bg-red-100 text-red-800",
		cancelled: "bg-gray-200 text-gray-600",
	};
	return (
		<span
			className={`rounded px-2 py-0.5 text-xs ${color[status] ?? "bg-gray-200"}`}
		>
			{status}
		</span>
	);
}
