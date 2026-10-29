import Link from "next/link";
import type { ReactNode } from "react";

export default function BulkLayout({ children }: { children: ReactNode }) {
	return (
		<div className="flex flex-col gap-6 p-6">
			<div className="flex gap-4 border-b pb-2">
				<Link href="/bulk/inventory" className="font-medium hover:underline">
					Inventory
				</Link>
				<Link href="/bulk/catalog" className="font-medium hover:underline">
					Catalog
				</Link>
				<Link href="/bulk/flash-deals" className="font-medium hover:underline">
					Flash deals
				</Link>
			</div>
			{children}
		</div>
	);
}
