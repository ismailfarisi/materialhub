"use client";
import {
	downloadTemplate,
	uploadToPresigned,
	useInitiateBulkUpload,
	useStartBulkJob,
} from "@/lib/queries/bulk";
import { type Category, useAdminCategoryTree } from "@/lib/queries/categories";
import { useState } from "react";

export type BulkJobType = "inventory_update" | "catalog_import";

/** Returns the strictness label for a given job type. */
export function strictnessLabelFor(jobType: BulkJobType): string {
	switch (jobType) {
		case "inventory_update":
			return "Strict (all-or-nothing)";
		case "catalog_import":
			return "Best effort (skip bad rows)";
	}
}

interface Props {
	jobType: BulkJobType;
	strictnessLabel: string;
	targetVendorId: string | null;
	onStarted?: (jobId: string) => void;
}

function flattenLeafCategories(
	categories: Category[],
	prefix = "",
): Array<{ name: string; slug: string }> {
	return categories.flatMap((category) => {
		const label = prefix ? `${prefix} / ${category.name}` : category.name;
		const children = category.children ?? [];
		if (children.length > 0) return flattenLeafCategories(children, label);
		return [{ name: label, slug: category.slug }];
	});
}

export function UploadPanel({
	jobType,
	strictnessLabel,
	targetVendorId,
	onStarted,
}: Props) {
	const [file, setFile] = useState<File | null>(null);
	const [format, setFormat] = useState<"csv" | "xlsx">("csv");
	const [importMode, setImportMode] = useState<"upsert" | "update">("upsert");
	const [selectedCategorySlugs, setSelectedCategorySlugs] = useState<string[]>(
		[],
	);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const initiate = useInitiateBulkUpload();
	const start = useStartBulkJob();
	const { data: categoryTree = [], isLoading: categoriesLoading } =
		useAdminCategoryTree();
	const isCatalogImport = jobType === "catalog_import";
	const leafCategories = isCatalogImport
		? flattenLeafCategories(categoryTree)
		: [];
	const canDownloadTemplate =
		!isCatalogImport || selectedCategorySlugs.length > 0;

	function toggleCategory(slug: string) {
		setSelectedCategorySlugs((prev) =>
			prev.includes(slug)
				? prev.filter((selectedSlug) => selectedSlug !== slug)
				: [...prev, slug],
		);
	}

	async function handleUpload() {
		if (!file || !targetVendorId) return;
		setBusy(true);
		setError(null);
		try {
			const { jobId, presignedUrl } = await initiate.mutateAsync({
				jobType,
				fileName: file.name,
				fileSizeBytes: file.size,
				fileFormat: format,
				targetVendorId,
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
				<h3 className="font-semibold">Upload</h3>
				<div className="text-sm text-taupe">Strictness: {strictnessLabel}</div>
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
					<div className="font-medium text-cacao">Import mode</div>
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
						<p className="text-xs text-taupe">
							Rows are matched by sku or external_id. Only the columns you
							include are changed; blank cells are left unchanged. Keys that
							match no existing product/variant are reported as errors.
						</p>
					)}
				</div>
			)}

			{isCatalogImport && (
				<div className="space-y-2 rounded border border-dashed p-3">
					<div className="flex items-center justify-between gap-3">
						<div>
							<h4 className="text-sm font-semibold text-cacao">
								Template categories
							</h4>
							<p className="text-xs text-taupe">
								Choose the leaf categories this file will contain. The
								downloaded template will include only their relevant attributes.
							</p>
						</div>
						{selectedCategorySlugs.length > 0 && (
							<button
								type="button"
								className="text-xs underline"
								onClick={() => setSelectedCategorySlugs([])}
							>
								Clear
							</button>
						)}
					</div>
					{categoriesLoading ? (
						<div className="text-xs text-taupe">Loading categories...</div>
					) : leafCategories.length === 0 ? (
						<div className="text-xs text-amber-600">
							No leaf categories found.
						</div>
					) : (
						<div className="grid max-h-52 gap-2 overflow-y-auto sm:grid-cols-2">
							{leafCategories.map((category) => (
								<label
									key={category.slug}
									className="flex items-start gap-2 rounded border px-2 py-1.5 text-sm"
								>
									<input
										type="checkbox"
										checked={selectedCategorySlugs.includes(category.slug)}
										onChange={() => toggleCategory(category.slug)}
										className="mt-1"
									/>
									<span>
										<span className="block text-cacao">{category.name}</span>
										<span className="text-xs text-taupe">{category.slug}</span>
									</span>
								</label>
							))}
						</div>
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
					disabled={!file || busy || !targetVendorId}
					className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
				>
					{busy ? "Uploading…" : "Start import"}
				</button>
				<button
					type="button"
					onClick={() =>
						downloadTemplate(jobType, "csv", {
							categorySlugs: selectedCategorySlugs,
						})
					}
					disabled={!canDownloadTemplate}
					className="rounded border px-4 py-2 text-sm disabled:opacity-50"
				>
					Download CSV template
				</button>
				<button
					type="button"
					onClick={() =>
						downloadTemplate(jobType, "xlsx", {
							categorySlugs: selectedCategorySlugs,
						})
					}
					disabled={!canDownloadTemplate}
					className="rounded border px-4 py-2 text-sm disabled:opacity-50"
				>
					Download XLSX template
				</button>
			</div>

			{isCatalogImport && selectedCategorySlugs.length === 0 && (
				<div className="text-xs text-amber-600">
					Select at least one category before downloading a catalog template.
				</div>
			)}
			{!targetVendorId && (
				<div className="text-xs text-amber-600">
					Select a target vendor first.
				</div>
			)}
			{error && <div className="text-sm text-red-600">{error}</div>}
		</div>
	);
}
