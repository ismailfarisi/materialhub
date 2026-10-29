"use client";
import { JobList } from "@/components/bulk/JobList";
import { UploadPanel } from "@/components/bulk/UploadPanel";
import { VendorSelector } from "@/components/bulk/VendorSelector";
import { useState } from "react";

export default function AdminBulkCatalogPage() {
	const [vendorId, setVendorId] = useState<string | null>(null);
	return (
		<div className="space-y-6">
			<h1 className="text-2xl font-semibold">Bulk catalog import (admin)</h1>
			<div className="flex items-center gap-3">
				<span className="text-sm text-taupe">Target vendor:</span>
				<VendorSelector
					value={vendorId}
					onChange={(v) => setVendorId(v || null)}
				/>
			</div>
			<UploadPanel
				jobType="catalog_import"
				strictnessLabel="Best effort"
				targetVendorId={vendorId}
			/>
			<div>
				<h2 className="mb-2 font-semibold">
					Recent jobs{vendorId ? " for selected vendor" : ""}
				</h2>
				<JobList jobType="catalog_import" vendorId={vendorId ?? undefined} />
			</div>
		</div>
	);
}
