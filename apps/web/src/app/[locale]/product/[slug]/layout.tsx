import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { fetchProduct } from "./data";

/**
 * 404 guard, outside this segment's loading.tsx Suspense boundary. In
 * production the ISR render already 404s, but any dynamic render (dev, a
 * cache miss rendered on demand with streaming) would flush the loading
 * skeleton with a 200 before the page's notFound() ran. Same cache entry as
 * the page, so it costs no extra request.
 */
export default async function ProductLayout({
	children,
	params,
}: {
	children: ReactNode;
	params: Promise<{ locale: string; slug: string }>;
}) {
	const { locale, slug } = await params;
	if (!(await fetchProduct(slug, locale))) notFound();
	return children;
}
