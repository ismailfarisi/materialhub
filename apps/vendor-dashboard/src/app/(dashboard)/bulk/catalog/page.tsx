"use client";
import { JobList } from "@/components/bulk/JobList";
import { UploadPanel } from "@/components/bulk/UploadPanel";

export default function BulkCatalogPage() {
	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-semibold">Bulk catalog import</h1>
				<p className="text-sm text-gray-500">
					UploadSimple products, variants, and attributes via CSV/XLSX. Best-effort
					import: valid rows land immediately; invalid rows appear in the error
					report. Image URLs process asynchronously.
				</p>
			</div>
			<UploadPanel jobType="catalog_import" strictnessLabel="Best effort" />
			<div>
				<h2 className="mb-2 font-semibold">Recent jobs</h2>
				<JobList jobType="catalog_import" />
			</div>
		</div>
	);
}
