import { LayoutRenderer } from "@/components/layout/layout-renderer";
import { apiServer } from "@/lib/api-server";
import { headers } from "next/headers";

interface Props {
	categorySlug: string;
	categoryId?: string;
	locale: string;
}

// Renders CMS-managed sections at the bottom of category-listing pages.
// Bidded section types (vendor_showcase, brand_spotlight, promotional_banner)
// are bid-aware via the existing layout resolver. Tries a category-scoped
// layout first, then a global fallback. Renders nothing if neither exists.
export async function CategoryFooterLayout({
	categorySlug,
	categoryId,
	locale,
}: Props) {
	const sections = await fetchSections(categorySlug, categoryId, locale);
	if (sections.length === 0) return null;

	return (
		// Already inside the page container, so no width or gutter of its own.
		<section className="border-t border-nl-cacao/12 pt-10 md:pt-14">
			<LayoutRenderer sections={sections} />
		</section>
	);
}

async function tryResolve(
	slug: string,
	params: URLSearchParams,
	// biome-ignore lint/suspicious/noExplicitAny: untyped layout payload from CMS resolver
): Promise<any[]> {
	const server = await apiServer();
	try {
		const res = await server.get(
			`/layouts/${encodeURIComponent(slug)}/resolve?${params.toString()}`,
		);
		return res.data?.data?.sections ?? [];
	} catch {
		return [];
	}
}

async function fetchSections(
	categorySlug: string,
	categoryId: string | undefined,
	locale: string,
) {
	const headersList = await headers();
	const ua = headersList.get("user-agent") || "";
	const device = /mobile|android|iphone/i.test(ua) ? "mobile" : "web";

	const params = new URLSearchParams({ locale, device });
	if (categoryId) params.set("context_category_id", categoryId);
	params.set("context_category_slug", categorySlug);

	const perCategory = await tryResolve(
		`category-footer-${categorySlug}`,
		params,
	);
	if (perCategory.length > 0) return perCategory;

	return tryResolve("category-footer", params);
}
