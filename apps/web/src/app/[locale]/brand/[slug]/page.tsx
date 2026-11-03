import { computeActiveFilters } from "@/components/product/filter-state";
import { Breadcrumb } from "@/components/product/breadcrumb";
import { buildBrandListingParams } from "@/components/product/listing-params";
import { ListingResults } from "@/components/product/listing-results";
import { ListingSeoContent } from "@/components/product/listing-seo-content";
import { formatFils, stockFor } from "@/components/swatch";
import { SupplierHeader } from "@/components/vendor/supplier-header";
import { TTL, publicGet } from "@/lib/api-public";
import { formatAedForLocale } from "@/lib/money";
import { buildAlternates } from "@/lib/seo/alternates";
import { getBrandFacts } from "@/lib/seo/listing-facts";
import { buildListingFaq } from "@/lib/seo/listing-faq";
import {
	buildCollectionJsonLd,
	buildFaqJsonLd,
} from "@/lib/seo/listing-jsonld";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

/**
 * As on the category listing, reading `searchParams` keeps this route
 * dynamically rendered — `revalidate` sets the freshness of the cached catalogue
 * reads instead. The point of dropping `force-dynamic` is that those reads are
 * cached at all: it marked every fetch in the segment as no-store, so each crawl
 * of each brand paid two cold round-trips to the product service.
 */
export const revalidate = 300;

interface Props {
	params: Promise<{ locale: string; slug: string }>;
	searchParams: Promise<Record<string, string>>;
}

// biome-ignore lint/suspicious/noExplicitAny: untyped API response shape
type Brand = any;

function fetchBrand(slug: string, locale: string): Promise<Brand | null> {
	// Brands are catalogue taxonomy and change about as often as categories do,
	// so they share the category-tree lifetime rather than the listing one.
	return publicGet<Brand>(`/brands/${slug}`, {
		revalidate: TTL.categoryTree,
		tags: [`brand:${slug}`],
		locale,
	});
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { locale, slug } = await params;

	const brand = await fetchBrand(slug, locale);
	if (!brand) return { title: "Brand" };

	// Shares its cache entry with the page body, so this costs no extra request.
	const facts = await getBrandFacts(slug, locale);
	const t = await getTranslations({ locale, namespace: "category" });

	const name: string = brand.name;
	const alternates = buildAlternates(locale, `/brand/${slug}`);

	// The previous title was `${brand.name} — MaterialHub`, which the root layout's
	// "%s | MaterialHub" template then rendered as "Acme Papers — MaterialHub |
	// MaterialHub". The brand suffix belongs to the template alone.
	const title: string =
		brand.meta_title || t("seo.titleTemplate", { entity: name });

	const description: string =
		brand.meta_description ||
		(facts.minPriceFils !== null && facts.total > 0
			? t("seo.descriptionWithPrice", {
					entity: name,
					count: facts.total,
					price: formatAedForLocale(facts.minPriceFils, locale),
				})
			: brand.description?.slice(0, 157) ||
				t("seo.descriptionFallback", { entity: name }));

	return {
		title,
		description,
		// Clean self-referencing canonical so the filter/sort param
		// permutations don't get indexed as duplicate brand URLs.
		alternates,
		openGraph: {
			type: "website",
			title,
			description,
			url: alternates.canonical,
			...(brand.logo_url ? { images: [brand.logo_url] } : {}),
		},
	};
}

export default async function BrandPage({ params, searchParams }: Props) {
	const { locale, slug } = await params;
	const filters = await searchParams;
	setRequestLocale(locale);

	const brand = await fetchBrand(slug, locale);

	if (!brand) notFound();

	const [productsRes, facts, siteSettings] = await Promise.all([
		publicGet<{
			// biome-ignore lint/suspicious/noExplicitAny: untyped API response shape
			data?: any[];
			total?: number;
			// biome-ignore lint/suspicious/noExplicitAny: untyped API response shape
			facets?: any;
		}>("/products", {
			params: buildBrandListingParams(slug, filters, 24, locale),
			revalidate: TTL.productListing,
			tags: ["products", `brand:${slug}`],
			locale,
					// null means the product service did not answer: say so, rather
			// than presenting an outage as an empty category.
		}).then((data) => data ?? { data: [], total: 0, facets: undefined, failed: true as const }),
		getBrandFacts(slug, locale),
		publicGet<Record<string, string>>("/site-settings", {
			params: { keys: "marketplace_return_window_days" },
			revalidate: TTL.categoryTree,
			tags: ["site-settings"],
			locale,
		}),
	]);

	const t = await getTranslations({ locale, namespace: "category" });

	// The page is already pinned to one brand, so hide the (now-redundant) brand
	// facet by passing an empty brand list — FilterGroups only renders the brand
	// group when `config.brands.length > 0`. Other facets flow through as usual.
	const facetConfig = {
		brands: [],
		vendors: productsRes.facets?.vendors || [],
		attributes: productsRes.facets?.attributes || [],
		priceRange: productsRes.facets?.priceRange || { min: 0, max: 100000 },
	};

	const initialParams = new URLSearchParams(filters as Record<string, string>);
	const { count: activeCount } = computeActiveFilters(
		facetConfig,
		initialParams,
	);

	const returnWindowDays = Number.parseInt(
		siteSettings?.marketplace_return_window_days ?? "",
		10,
	);

	const faq = buildListingFaq({
		entityName: brand.name,
		total: facts.total,
		minPriceFils: facts.minPriceFils,
		formatPrice: (fils) => formatAedForLocale(fils, locale),
		// Empty on purpose: a "which brands can I buy" answer is meaningless on a
		// page that lists exactly one brand, so `buildListingFaq` drops the entry.
		brandLabels: [],
		brandCount: 0,
		returnWindowDays: Number.isFinite(returnWindowDays)
			? returnWindowDays
			: null,
		t,
	});

	const collectionJsonLd = buildCollectionJsonLd({
		locale,
		path: `/brand/${slug}`,
		name: brand.name,
		description: brand.meta_description || brand.description,
		products: productsRes.data || [],
		// Ties the listing to the brand as an entity rather than leaving it as an
		// unattributed set of products.
		about: {
			"@type": "Brand",
			name: brand.name,
			...(brand.logo_url ? { logo: brand.logo_url } : {}),
		},
	});
	const faqJsonLd = buildFaqJsonLd(faq);

	const tb = await getTranslations({ locale, namespace: "browse" });
	const nf = new Intl.NumberFormat(locale === "ar" ? "ar-AE" : "en-AE");

	// A brand has no category of its own; it wears the stock of the category
	// most of its listed products sit in (as its product cards do). No products,
	// no stock — the header then drops the tab rather than guess.
	const categoryCounts = new Map<string, number>();
	for (const p of productsRes.data ?? []) {
		if (p?.category_name) {
			categoryCounts.set(p.category_name, (categoryCounts.get(p.category_name) ?? 0) + 1);
		}
	}
	const mainCategory = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
	const stock = mainCategory ? stockFor(mainCategory) : null;

	const supplierCount = productsRes.facets?.vendors?.length ?? 0;
	const headerFacts = [
		...(facts.total > 0 ? [{ label: tb("factProducts"), value: nf.format(facts.total) }] : []),
		...(facts.minPriceFils !== null && facts.total > 0
			? [{ label: tb("factFrom"), value: `AED ${formatFils(facts.minPriceFils, locale)}` }]
			: []),
		// Facets follow the active filters, so the supplier count is only a fact
		// about the brand when nothing is filtered.
		...(activeCount === 0 && supplierCount > 0
			? [{ label: tb("factSuppliers"), value: nf.format(supplierCount) }]
			: []),
	];

	return (
		<div className="mx-auto max-w-[1400px] px-4 pb-4 md:px-8">
			<div className="pt-2 pb-6 md:pb-8">
				<Breadcrumb
					items={[
						{ name: tb("brandsCrumb"), href: "/brands" },
						{ name: brand.name },
					]}
				/>
				<SupplierHeader
					className="mt-1"
					name={brand.name}
					logoUrl={brand.logo_url}
					description={brand.description}
					stock={stock}
					tabLabel={mainCategory}
					facts={headerFacts}
				/>
			</div>

			<ListingResults
				config={facetConfig}
				products={productsRes.data || []}
				total={productsRes.total || 0}
				activeCount={activeCount}
				isError={"failed" in productsRes}
			/>

			<ListingSeoContent
				locale={locale}
				entityName={brand.name}
				facts={facts}
				faq={faq}
				variant="brand"
			/>

			<script
				type="application/ld+json"
				// biome-ignore lint/security/noDangerouslySetInnerHtml: schema.org JSON-LD payload
				dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }}
			/>
			{faqJsonLd && (
				<script
					type="application/ld+json"
					// biome-ignore lint/security/noDangerouslySetInnerHtml: schema.org JSON-LD payload
					dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
				/>
			)}
		</div>
	);
}
