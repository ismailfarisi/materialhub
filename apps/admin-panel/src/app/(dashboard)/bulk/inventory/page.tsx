"use client";
import { JobList } from "@/components/bulk/JobList";
import { UploadPanel } from "@/components/bulk/UploadPanel";
import { VendorSelector } from "@/components/bulk/VendorSelector";
import { useState } from "react";

export default function AdminBulkInventoryPage() {
	const [vendorId, setVendorId] = useState<string | null>(null);

	return (
		<div className="space-y-6">
			<h1 className="text-2xl font-semibold">Bulk inventory update (admin)</h1>
			<div className="flex items-center gap-3">
				<span className="text-sm text-taupe">Target vendor:</span>
				<VendorSelector
					value={vendorId}
					onChange={(v) => setVendorId(v || null)}
				/>
			</div>
			<UploadPanel
				jobType="inventory_update"
				strictnessLabel="Strict (all-or-nothing)"
				targetVendorId={vendorId}
			/>
			<div>
				<h2 className="mb-2 font-semibold">
					Recent jobs{vendorId ? " for selected vendor" : ""}
				</h2>
				<JobList jobType="inventory_update" vendorId={vendorId ?? undefined} />
			</div>
		</div>
	);
}
