import { getProductCount } from "@/lib/seo/catalog-source";
import { PRODUCTS_PER_SITEMAP } from "@/lib/seo/config";
import { buildSitemapIndex } from "@/lib/seo/xml";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export async function GET() {
	const count = await getProductCount();
	const chunks = Math.max(1, Math.ceil(count / PRODUCTS_PER_SITEMAP));

	const files = [
		"static.xml",
		"categories.xml",
		"brands.xml",
		"vendors.xml",
		"services.xml",
		...Array.from({ length: chunks }, (_, i) => `products-${i}.xml`),
	];

	return new Response(buildSitemapIndex(files), {
		headers: {
			"Content-Type": "application/xml",
			"Cache-Control": "public, max-age=0, s-maxage=3600",
		},
	});
}
