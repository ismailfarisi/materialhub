"use client";
import {
	fetchErrorReportUrl,
	useBulkJob,
	useBulkJobChanges,
	useCancelBulkJob,
} from "@/lib/queries/bulk";
import { useState } from "react";
import { FailedImagesTab } from "./FailedImagesTab";
import { ProgressBar } from "./ProgressBar";

function diffFieldLabel(field: string): string {
	switch (field) {
		case "_created":
			return "Created";
		case "_deleted":
			return "Deleted";
		case "_reverted":
			return "Reverted";
		default:
			return field;
	}
}

export function JobDetailDrawer({
	jobId,
	onClose,
}: { jobId: string | null; onClose: () => void }) {
	const { data: job } = useBulkJob(jobId);
	const { data: changes } = useBulkJobChanges(jobId);
	const cancel = useCancelBulkJob();
	const [reportUrl, setReportUrl] = useState<string | null>(null);
	const [tab, setTab] = useState<"overview" | "changes" | "failed_images">(
		"overview",
	);

	if (!jobId) return null;
	if (!job)
		return (
			<div className="fixed inset-y-0 right-0 w-96 border-l bg-linen p-4">
				Loading…
			</div>
		);


	return (
		<>
			<div className="fixed inset-y-0 right-0 w-[32rem] border-l bg-linen shadow-lg overflow-y-auto">
				<div className="flex items-center justify-between border-b p-4">
					<div>
						<div className="font-semibold">{job.fileName}</div>
						<div className="text-xs text-taupe">Job {job.id.slice(0, 8)}…</div>
					</div>
					<button type="button" onClick={onClose} className="text-taupe">
						✕
					</button>
				</div>

				<div className="border-b p-4 space-y-2">
					<div>
						Status: <span className="font-medium">{job.status}</span>
					</div>
					<ProgressBar value={job.processedRows} max={job.totalRows} />
					<div className="text-xs text-taupe">
						✓ {job.succeededRows} succeeded · ⚠ {job.skippedRows} skipped
					</div>
					{job.status === "queued" || job.status === "running" ? (
						<button
							type="button"
							onClick={() => cancel.mutate(job.id)}
							className="mt-2 rounded border px-3 py-1 text-sm"
						>
							Cancel
						</button>
					) : null}
					{(job.status === "completed_with_errors" ||
						job.status === "failed") && (
						<button
							type="button"
							onClick={async () =>
								setReportUrl(await fetchErrorReportUrl(job.id))
							}
							className="mt-2 rounded border px-3 py-1 text-sm"
						>
							Fetch error report
						</button>
					)}
					{reportUrl && (
						<a
							href={reportUrl}
							target="_blank"
							rel="noreferrer"
							className="mt-2 block text-sm text-amber underline"
						>
							Download report.csv
						</a>
					)}
					{job.revertedAt && (
						<span className="text-xs text-taupe">
							Reverted {new Date(job.revertedAt).toLocaleString()}
						</span>
					)}

				</div>

				<div className="flex gap-3 border-b px-4">
					{(
						[
							"overview",
							"changes",
							...(job.jobType === "catalog_import" && job.imagesFailed > 0
								? (["failed_images"] as const)
								: []),
						] as Array<"overview" | "changes" | "failed_images">
					).map((t) => (
						<button
							key={t}
							type="button"
							onClick={() => setTab(t)}
							className={`py-2 text-sm ${tab === t ? "border-b-2 border-black font-medium" : "text-taupe"}`}
						>
							{t === "overview"
								? "Overview"
								: t === "changes"
									? "Changes made"
									: "Failed images"}
						</button>
					))}
				</div>

				{tab === "overview" && (
					<pre className="p-4 text-xs">{JSON.stringify(job, null, 2)}</pre>
				)}
				{tab === "changes" && (
					<div className="p-4 text-xs">
						{changes?.items?.length ? (
							<table className="w-full" data-stack="md">
								<thead>
									<tr className="text-left text-taupe">
										<th>Row</th>
										<th>Field</th>
										<th>Old</th>
										<th>New</th>
									</tr>
								</thead>
								<tbody>
									{changes.items.map((c) => (
										<tr
											key={`${c.rowNumber}-${c.field}-${c.at}`}
											className="border-t"
										>
											<td data-label="Row">{c.rowNumber}</td>
											<td data-label="Field">{diffFieldLabel(c.field)}</td>
											<td data-label="Old" className="text-red-600">{String(c.oldValue)}</td>
											<td data-label="New" className="text-green-700">{String(c.newValue)}</td>
										</tr>
									))}
								</tbody>
							</table>
						) : (
							<div className="text-taupe">No changes recorded.</div>
						)}
					</div>
				)}
				{tab === "failed_images" && <FailedImagesTab jobId={job.id} />}
			</div>
		</>
	);
}
