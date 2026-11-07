"use client";
import { JobList } from "@/components/bulk/JobList";
import { UploadPanel } from "@/components/bulk/UploadPanel";

export default function BulkInventoryPage() {
	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-semibold">Bulk inventory update</h1>
				<p className="text-sm text-gray-500">
					Upload a CSV or XLSX of SKU → new stock level. Strict validation: any
					bad row rejects the whole file.
				</p>
			</div>

			<UploadPanel
				jobType="inventory_update"
				strictnessLabel="Strict (all-or-nothing)"
			/>

			<div>
				<h2 className="mb-2 font-semibold">Recent jobs</h2>
				<JobList jobType="inventory_update" />
			</div>
		</div>
	);
}
