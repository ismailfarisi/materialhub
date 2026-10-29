"use client";

import { ProductGroupEditor } from "@/components/products/ProductGroupEditor";

export default function NewColorFamilyPage() {
	return (
		<div className="space-y-4">
			<div>
				<h1 className="text-2xl font-bold text-gray-900">New Color Family</h1>
				<p className="text-sm text-gray-500">
					Group related shades into one discoverable family. Each shade becomes
					its own product, linked by a shared grouping attribute.
				</p>
			</div>
			<ProductGroupEditor />
		</div>
	);
}
