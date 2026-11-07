import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { fetchCategory } from "./data";

/**
 * 404 guard for this segment. It sits outside the segment's loading.tsx
 * Suspense boundary, so an unknown slug calls notFound() before any HTML is
 * streamed and the response is a real HTTP 404. Called from the page instead,
 * notFound() ran after the loading skeleton had already been flushed with a
 * 200 (a soft 404). The read shares its cache entry with the page.
 */
export default async function CategoryLayout({
	children,
	params,
}: {
	children: ReactNode;
	params: Promise<{ locale: string; "category-slug": string }>;
}) {
	const { locale, "category-slug": slug } = await params;
	if (!(await fetchCategory(slug, locale))) notFound();
	return children;
}
