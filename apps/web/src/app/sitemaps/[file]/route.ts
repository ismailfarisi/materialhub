import {
	getBrands,
	getCategories,
	getProducts,
	getVendors,
} from "@/lib/seo/catalog-source";
import { PRODUCTS_PER_SITEMAP, STATIC_PATHS } from "@/lib/seo/config";
import { buildUrlset } from "@/lib/seo/xml";

export const revalidate = 3600;

function xml(body: string) {
	return new Response(body, {
		headers: {
			"Content-Type": "application/xml",
			"Cache-Control": "public, max-age=0, s-maxage=3600",
		},
	});
}

export async function GET(
	_request: Request,
	{ params }: { params: { file: string } },
) {
	const name = params.file.replace(/\.xml$/, "");

	if (name === "static") {
		return xml(
			buildUrlset(
				STATIC_PATHS.map((path) => ({ path })),
				0.9,
				"weekly",
			),
		);
	}

	if (name === "categories") {
		return xml(buildUrlset(await getCategories(), 0.8, "daily"));
	}

	if (name === "brands") {
		return xml(buildUrlset(await getBrands(), 0.7, "weekly"));
	}

	if (name === "vendors") {
		return xml(buildUrlset(await getVendors(), 0.6, "weekly"));
	}

	const productMatch = name.match(/^products-(\d+)$/);
	if (productMatch) {
		const index = Number(productMatch[1]);
		const all = await getProducts();
		const slice = all.slice(
			index * PRODUCTS_PER_SITEMAP,
			(index + 1) * PRODUCTS_PER_SITEMAP,
		);
		if (!slice.length) return new Response("Not found", { status: 404 });
		return xml(buildUrlset(slice, 0.7, "weekly"));
	}

	return new Response("Not found", { status: 404 });
}
