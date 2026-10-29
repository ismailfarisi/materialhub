"use client";
import {
	downloadTemplate,
	uploadToPresigned,
	useInitiateBulkUpload,
	useStartBulkJob,
} from "@/lib/queries/bulk";
import { useState } from "react";

export type BulkJobType =
	| "inventory_update"
	| "catalog_import"
	| "flash_deal_import"
	| "flash_deal_delete";

/** Returns the strictness label for a given job type. */
export function strictnessLabelFor(jobType: BulkJobType): string {
	switch (jobType) {
		case "inventory_update":
			return "Strict (all-or-nothing)";
		case "catalog_import":
			return "Best effort (skip bad rows)";
		case "flash_deal_import":
			return "Best effort (skip bad rows)";
		case "flash_deal_delete":
			return "Best effort (skip bad rows)";
	}
}

interface Props {
	jobType: BulkJobType;
	strictnessLabel: string;
	onStarted?: (jobId: string) => void;
}

export function UploadPanel({ jobType, strictnessLabel, onStarted }: Props) {
	const [file, setFile] = useState<File | null>(null);
	const [format, setFormat] = useState<"csv" | "xlsx">("csv");
	const [importMode, setImportMode] = useState<"upsert" | "update">("upsert");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const initiate = useInitiateBulkUpload();
	const start = useStartBulkJob();
	const isCatalogImport = jobType === "catalog_import";

	async function handleUpload() {
		if (!file) return;
		setBusy(true);
		setError(null);
		try {
			const { jobId, presignedUrl } = await initiate.mutateAsync({
				jobType,
				fileName: file.name,
				fileSizeBytes: file.size,
				fileFormat: format,
				mode: isCatalogImport ? importMode : undefined,
			});
			await uploadToPresigned(presignedUrl, file);
			await start.mutateAsync(jobId);
			onStarted?.(jobId);
			setFile(null);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="rounded-lg border p-4 space-y-4">
			<div className="flex items-center justify-between">
				<h3 className="font-semibold">UploadSimple</h3>
				<div className="text-sm text-gray-500">
					Strictness: {strictnessLabel}
				</div>
			</div>

			<div className="flex gap-4 text-sm">
				<label className="flex items-center gap-2">
					<input
						type="radio"
						checked={format === "csv"}
						onChange={() => setFormat("csv")}
					/>{" "}
					CSV
				</label>
				<label className="flex items-center gap-2">
					<input
						type="radio"
						checked={format === "xlsx"}
						onChange={() => setFormat("xlsx")}
					/>{" "}
					XLSX
				</label>
			</div>

			{isCatalogImport && (
				<div className="space-y-1 text-sm">
					<div className="font-medium text-gray-900">Import mode</div>
					<label className="flex items-center gap-2">
						<input
							type="radio"
							checked={importMode === "upsert"}
							onChange={() => setImportMode("upsert")}
						/>{" "}
						Create &amp; update (full rows)
					</label>
					<label className="flex items-center gap-2">
						<input
							type="radio"
							checked={importMode === "update"}
							onChange={() => setImportMode("update")}
						/>{" "}
						Update existing only (key + changed columns)
					</label>
					{importMode === "update" && (
						<p className="text-xs text-gray-500">
							Rows are matched by sku or external_id. Only the columns you
							include are changed; blank cells are left unchanged. Keys that
							match no existing product/variant are reported as errors.
						</p>
					)}
				</div>
			)}

			<input
				type="file"
				accept={format === "csv" ? ".csv,text/csv" : ".xlsx"}
				onChange={(e) => setFile(e.target.files?.[0] ?? null)}
				disabled={busy}
			/>

			<div className="flex gap-2">
				<button
					type="button"
					onClick={handleUpload}
					disabled={!file || busy}
					className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
				>
					{busy ? "Uploading…" : "Start import"}
				</button>
				<button
					type="button"
					onClick={() => downloadTemplate(jobType, "csv")}
					className="rounded border px-4 py-2 text-sm"
				>
					DownloadSimple CSV template
				</button>
				<button
					type="button"
					onClick={() => downloadTemplate(jobType, "xlsx")}
					className="rounded border px-4 py-2 text-sm"
				>
					DownloadSimple XLSX template
				</button>
			</div>

			{error && <div className="text-sm text-red-600">{error}</div>}
		</div>
	);
}
