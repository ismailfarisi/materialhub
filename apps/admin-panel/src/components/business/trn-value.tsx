"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";

/**
 * A TRN in mono with a format check beside it. `formatValid` comes from the
 * server (`trn_format_valid`); the check is format only, not an FTA lookup.
 */
export function TrnValue({
	trn,
	formatValid,
	emptyLabel = "No TRN",
}: {
	trn: string | null | undefined;
	formatValid: boolean;
	emptyLabel?: string;
}) {
	if (!trn) {
		return <span className="text-sm text-taupe">{emptyLabel}</span>;
	}
	return (
		<span className="inline-flex items-center gap-1.5 whitespace-nowrap">
			<span className="font-mono text-sm tabular-nums text-cacao">{trn}</span>
			{formatValid ? (
				<CheckCircle2
					size={14}
					className="text-amber shrink-0"
					aria-label="15-digit format OK"
				/>
			) : (
				<span className="inline-flex items-center gap-1 text-xs font-medium text-russet">
					<AlertTriangle size={13} className="shrink-0" aria-hidden />
					Not 15 digits
				</span>
			)}
		</span>
	);
}

export const VERIFICATION_COLORS: Record<string, string> = {
	pending: "bg-caramel/10 text-caramel border border-caramel/30",
	verified: "bg-amber/10 text-amber border border-amber/30",
	rejected: "bg-russet/10 text-russet border border-russet/30",
};

export const NET_TERMS_COLORS: Record<string, string> = {
	applied: "bg-caramel/10 text-caramel border border-caramel/30",
	approved: "bg-amber/10 text-amber border border-amber/30",
	rejected: "bg-russet/10 text-russet border border-russet/30",
	suspended: "bg-russet/10 text-russet border border-russet/30",
};

/**
 * Opens a signed URL in a new tab. The tab is opened synchronously inside the
 * click so popup blockers allow it, then pointed at the URL once it arrives.
 */
export function openSignedUrl(
	fetchUrl: () => Promise<{ url: string }>,
	onError: (err: unknown) => void,
) {
	const tab = window.open("about:blank", "_blank");
	fetchUrl()
		.then(({ url }) => {
			if (tab) {
				tab.opener = null;
				tab.location.href = url;
			} else window.location.assign(url);
		})
		.catch((err) => {
			tab?.close();
			onError(err);
		});
}
