"use client";
import { JobList } from "@/components/bulk/JobList";
import {
	type BulkJobType,
	UploadPanel,
	strictnessLabelFor,
} from "@/components/bulk/UploadPanel";
import { useState } from "react";

export default function BulkFlashDealsPage() {
	const [op, setOp] = useState<BulkJobType>("flash_deal_import");

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-semibold">
					Flash deals — bulk operations
				</h1>
				<p className="text-sm text-gray-500">
					Create or remove flash deals in bulk via CSV/XLSX.
				</p>
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

			<UploadPanel jobType={op} strictnessLabel={strictnessLabelFor(op)} />

			<div>
				<h2 className="mb-2 font-semibold">Recent jobs — create deals</h2>
				<JobList jobType="flash_deal_import" />
			</div>

			<div>
				<h2 className="mb-2 font-semibold">Recent jobs — remove deals</h2>
				<JobList jobType="flash_deal_delete" />
			</div>
		</div>
	);
}
