"use client";

import {
	usePublishProduct,
	useSubmitProductForReview,
	useUnpublishProduct,
} from "@/lib/queries/products";
import { productStatusInfo } from "@/lib/product-status";
import { Button, StatusBadge } from "@materialhub/ui";
import { useState } from "react";

function errorMessage(err: unknown): string {
	const e = err as { response?: { data?: { message?: string } } };
	return e?.response?.data?.message ?? "Could not change the product status. Try again.";
}

/**
 * Status badge plus the one next step the vendor can take (submit, publish or
 * unpublish). `compact` renders just the button, for table rows.
 */
export function ProductStatusControl({
	productId,
	status,
	rejectionReason,
	compact = false,
}: {
	productId: string;
	status: string | null | undefined;
	rejectionReason?: string | null;
	compact?: boolean;
}) {
	const publish = usePublishProduct();
	const unpublish = useUnpublishProduct();
	const submit = useSubmitProductForReview();
	const [error, setError] = useState<string | null>(null);
	const info = productStatusInfo(status);
	const busy = publish.isPending || unpublish.isPending || submit.isPending;

	function run() {
		setError(null);
		const m = info.action === "publish" ? publish : info.action === "unpublish" ? unpublish : submit;
		m.mutate(productId, { onError: (err) => setError(errorMessage(err)) });
	}

	const button = info.action ? (
		<Button
			type="button"
			size="sm"
			variant={info.action === "unpublish" ? "outline" : "default"}
			disabled={busy}
			onClick={run}
		>
			{busy ? "Saving…" : info.label}
		</Button>
	) : null;

	if (compact) {
		return (
			<div className="flex flex-col items-end gap-1">
				{button}
				{error ? (
					<p role="alert" className="max-w-56 text-right text-xs text-destructive">
						{error}
					</p>
				) : null}
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-2 rounded-lg border border-pearl/40 p-3 sm:flex-row sm:items-center sm:justify-between">
			<div className="flex min-w-0 flex-col gap-1">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium">Status</span>
					{status ? <StatusBadge status={status} /> : null}
				</div>
				{info.hint ? <p className="text-xs text-muted-foreground">{info.hint}</p> : null}
				{status === "rejected" && rejectionReason ? (
					<p className="text-xs text-destructive">Reviewer note: {rejectionReason}</p>
				) : null}
				{error ? (
					<p role="alert" className="text-xs text-destructive">
						{error}
					</p>
				) : null}
			</div>
			{button}
		</div>
	);
}
