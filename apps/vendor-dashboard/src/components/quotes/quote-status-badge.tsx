import { cn } from "@materialhub/ui";
import { QUOTE_STATUS_COLORS, SUPPLIER_STATUS_LABEL } from "./quote-helpers";

/** Supplier-side quote status in the dashboard's badge style, with RFQ wording. */
export function QuoteStatusBadge({ status }: { status: string }) {
	return (
		<span
			className={cn(
				"inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
				QUOTE_STATUS_COLORS[status] ??
					"bg-pearl/20 text-taupe border border-pearl/30",
			)}
		>
			{SUPPLIER_STATUS_LABEL[status] ?? status.replace(/_/g, " ")}
		</span>
	);
}
