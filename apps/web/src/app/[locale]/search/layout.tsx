import type { Metadata } from "next";
import type { ReactNode } from "react";

// Internal site-search results are query-parameter URLs (?q=, ?brand=, ?sort=…)
// that Google advises against indexing — they're thin, near-duplicate and waste
// crawl budget. Keep them crawlable for link discovery (follow) but out of the
// index (noindex). Canonical brand/category landing pages carry the SEO value.
export const metadata: Metadata = {
	robots: { index: false, follow: true },
};

export default function SearchLayout({ children }: { children: ReactNode }) {
	return children;
}
