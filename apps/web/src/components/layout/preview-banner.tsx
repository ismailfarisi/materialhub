"use client";

import { Eye, TriangleAlert } from "lucide-react";

interface PreviewBannerProps {
	status: "active" | "expired" | "not_found" | "wrong_page" | "layout";
	bidIdShort?: string;
	expiresAt?: string;
}

/**
 * Shown to vendors previewing a section bid through a preview token. Binder
 * black like the utility bar, so it reads as tooling, not as page content.
 * Inactive states carry a warning icon; nothing here uses a stock colour.
 */
export function PreviewBanner({
	status,
	bidIdShort,
	expiresAt,
}: PreviewBannerProps) {
	const message =
		status === "layout"
			? "Previewing a draft layout. Customers still see the published page."
			: status === "active"
			? `Viewing bid ${bidIdShort ?? ""}${expiresAt ? ` · token expires ${new Date(expiresAt).toLocaleTimeString("en-AE")}` : ""}`
			: status === "expired"
				? "Preview token expired. Refresh it from the vendor dashboard."
				: status === "not_found"
					? "Bid not found. Showing the live page."
					: "This bid is on a different page. Showing the live page.";

	const Icon = status === "active" || status === "layout" ? Eye : TriangleAlert;

	return (
		<output className="block bg-nl-espresso text-white">
			<div className="max-w-[1400px] mx-auto px-4 md:px-8 py-2.5 flex items-center justify-center gap-2.5 text-[13.5px] leading-snug text-center">
				<Icon
					aria-hidden="true"
					className="h-4 w-4 shrink-0 text-white/80"
					strokeWidth={1.75}
				/>
				<span className="mill-label shrink-0">Preview</span>
				<span className="text-white/85 [overflow-wrap:anywhere]">
					{message}
				</span>
			</div>
		</output>
	);
}
