import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { fetchVendor } from "./data";

/**
 * 404 guard for this segment. It sits outside the segment's loading.tsx
 * Suspense boundary, so an unknown slug calls notFound() before any HTML is
 * streamed and the response is a real HTTP 404. Called from the page instead,
 * notFound() ran after the loading skeleton had already been flushed with a
 * 200 (a soft 404). `fetchVendor` is memoised per request, so the page reuses it.
 */
export default async function VendorLayout({
	children,
	params,
}: {
	children: ReactNode;
	params: Promise<{ locale: string; slug: string }>;
}) {
	const { slug } = await params;
	if (!(await fetchVendor(slug))) notFound();
	return children;
}
