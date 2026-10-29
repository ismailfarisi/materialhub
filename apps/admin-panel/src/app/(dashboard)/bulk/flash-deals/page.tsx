"use client";
import { JobList } from "@/components/bulk/JobList";
import {
	type BulkJobType,
	UploadPanel,
	strictnessLabelFor,
} from "@/components/bulk/UploadPanel";
import { VendorSelector } from "@/components/bulk/VendorSelector";
import { useState } from "react";

export default function AdminBulkFlashDealsPage() {
	const [vendorId, setVendorId] = useState<string | null>(null);
	const [op, setOp] = useState<BulkJobType>("flash_deal_import");

	return (
		<div className="space-y-6">
			<h1 className="text-2xl font-semibold">
				Flash deals — bulk operations (admin)
			</h1>

			<div className="flex items-center gap-3">
				<span className="text-sm text-taupe">Target vendor:</span>
				<VendorSelector
					value={vendorId}
					onChange={(v) => setVendorId(v || null)}
				/>
			</div>

			<div className="inline-flex rounded-lg border bg-white p-1">
				<button
					type="button"
					onClick={() => setOp("flash_deal_import")}
					className={`rounded-md px-3 py-1.5 text-sm ${
						op === "flash_deal_import"
							? "bg-gray-100 font-medium"
							: "text-gray-600 hover:bg-gray-50"
					}`}
				>
					Create deals
				</button>
				<button
					type="button"
					onClick={() => setOp("flash_deal_delete")}
					className={`rounded-md px-3 py-1.5 text-sm ${
						op === "flash_deal_delete"
							? "bg-gray-100 font-medium"
							: "text-gray-600 hover:bg-gray-50"
					}`}
				>
					Remove deals
				</button>
			</div>

			<UploadPanel
				jobType={op}
				strictnessLabel={strictnessLabelFor(op)}
				targetVendorId={vendorId}
			/>

			<div>
				<h2 className="mb-2 font-semibold">
					Recent jobs — create deals{vendorId ? " for selected vendor" : ""}
				</h2>
				<JobList jobType="flash_deal_import" vendorId={vendorId ?? undefined} />
			</div>

			<div>
				<h2 className="mb-2 font-semibold">
					Recent jobs — remove deals{vendorId ? " for selected vendor" : ""}
				</h2>
				<JobList jobType="flash_deal_delete" vendorId={vendorId ?? undefined} />
			</div>
		</div>
	);
}
