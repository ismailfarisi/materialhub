/**
 * What a vendor can do next with a product, given its moderation status.
 *
 * Lifecycle: draft -> pending_review -> (admin) approved | rejected;
 * approved -> published (vendor Publish) -> approved (vendor Unpublish).
 * `unpublished` is an admin takedown; only MaterialHub can republish it.
 */
export type ProductStatusAction = "submit" | "publish" | "unpublish";

export interface ProductStatusInfo {
	action: ProductStatusAction | null;
	label: string | null;
	hint: string;
}

export function productStatusInfo(status: string | null | undefined): ProductStatusInfo {
	switch (status) {
		case "draft":
			return {
				action: "submit",
				label: "Submit for review",
				hint: "MaterialHub reviews every product before it can go live.",
			};
		case "rejected":
			return {
				action: "submit",
				label: "Resubmit for review",
				hint: "Fix what the reviewer flagged, then resubmit.",
			};
		case "pending_review":
			return { action: null, label: null, hint: "Waiting for MaterialHub review." };
		case "approved":
			return {
				action: "publish",
				label: "Publish",
				hint: "Approved. Publish to make it visible to buyers.",
			};
		case "published":
			return {
				action: "unpublish",
				label: "Unpublish",
				hint: "Live on the storefront.",
			};
		case "unpublished":
			return {
				action: null,
				label: null,
				hint: "Taken offline by MaterialHub. Contact support to relist it.",
			};
		case "archived":
			return { action: null, label: null, hint: "Archived. Not visible to buyers." };
		default:
			return { action: null, label: null, hint: "" };
	}
}

export interface BulkActionResult {
	affected: number;
	succeeded?: string[];
	failed?: Array<{ id: string; code: string; message: string }>;
}

/** One-line outcome of a bulk action, e.g. "2 published, 1 not: Submit the product for review…". */
export function summarizeBulkResult(verb: string, result: BulkActionResult | undefined): string {
	const done = result?.affected ?? 0;
	const failed = result?.failed ?? [];
	if (failed.length === 0) return `${done} ${verb}.`;
	const reasons = [...new Set(failed.map((f) => f.message))].join("; ");
	return `${done} ${verb}, ${failed.length} not: ${reasons}`;
}
