"use client";

import type { PackingSlip as PackingSlipData } from "@/lib/queries/gift-fulfillment";
import { Button } from "@materialhub/ui";
import { Printer } from "lucide-react";

interface PackingSlipProps {
	slip: PackingSlipData;
}

/**
 * Print-friendly packing slip for a gift order. No PDF lib — uses the browser's
 * native print dialog via window.print(). The surrounding dashboard chrome is
 * hidden at print time through the `print:hidden` / `print:block` utilities so
 * only this slip ends up on paper.
 */
export function PackingSlip({ slip }: PackingSlipProps) {
	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between print:hidden">
				<h2 className="text-lg font-semibold text-cacao">Packing Slip</h2>
				<Button type="button" size="sm" onClick={() => window.print()}>
					<Printer size={15} className="mr-1.5" />
					Print
				</Button>
			</div>

			<div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-800 print:border-0 print:p-0">
				<div className="mb-4 border-b border-gray-200 pb-4">
					<p className="text-xs uppercase tracking-wide text-gray-500">
						Gift box
					</p>
					<p className="text-base font-semibold text-cacao">{slip.box_name}</p>
					<p className="mt-1 text-xs text-gray-500">
						Gift order #{slip.gift_order_id}
					</p>
				</div>

				<div className="mb-4 grid grid-cols-2 gap-4 border-b border-gray-200 pb-4">
					<div>
						<p className="text-xs uppercase tracking-wide text-gray-500">
							Recipient
						</p>
						<p className="font-medium">{slip.recipient_name ?? "—"}</p>
					</div>
					<div>
						<p className="text-xs uppercase tracking-wide text-gray-500">
							Status
						</p>
						<p className="font-medium capitalize">
							{slip.fulfillment_status.replace(/_/g, " ")}
						</p>
					</div>
				</div>

				{slip.gift_message ? (
					<div className="mb-4 border-b border-gray-200 pb-4">
						<p className="text-xs uppercase tracking-wide text-gray-500">
							Gift message
						</p>
						<p className="mt-1 whitespace-pre-wrap italic">
							“{slip.gift_message}”
						</p>
					</div>
				) : null}

				<div>
					<p className="mb-2 text-xs uppercase tracking-wide text-gray-500">
						Items ({slip.items.length})
					</p>
					<table className="w-full border-collapse text-sm">
						<thead>
							<tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
								<th className="py-1.5 pr-2 font-medium">Product</th>
								<th className="py-1.5 pr-2 font-medium">Variant</th>
								<th className="py-1.5 pr-2 font-medium">Vendor</th>
								<th className="py-1.5 text-right font-medium">Qty</th>
							</tr>
						</thead>
						<tbody>
							{slip.items.map((it, i) => (
								<tr
									key={`${it.product_name}-${i}`}
									className="border-b border-gray-100"
								>
									<td className="py-1.5 pr-2">{it.product_name}</td>
									<td className="py-1.5 pr-2 text-gray-500">
										{it.variant_name ?? "—"}
									</td>
									<td className="py-1.5 pr-2 text-gray-500">
										{it.vendor_name ?? "—"}
									</td>
									<td className="py-1.5 text-right tabular-nums">
										{it.quantity}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
}
