import { CategoryFooterLayout } from "@/components/category/category-footer-layout";
import { plasticBanFacetCount } from "@/components/eco";
import { HeroBanner } from "@/components/home/hero-banner";
import { type CmsBanner, bannersToSlides } from "@/lib/cms-content";
import { computeActiveFilters } from "@/components/product/filter-state";
import { ListingHeader } from "@/components/product/listing-header";
import { buildListingParams } from "@/components/product/listing-params";
import { ListingResults } from "@/components/product/listing-results";
import { ListingSeoContent } from "@/components/product/listing-seo-content";
import { CategoryQuoteBand } from "@/components/rfq/category-quote-band";
import { formatFils, stockFor } from "@/components/swatch";
import { TTL, publicGet } from "@/lib/api-public";
import { formatAedForLocale } from "@/lib/money";
import { buildAlternates } from "@/lib/seo/alternates";
import { buildListingFaq } from "@/lib/seo/listing-faq";
import { getCategoryFacts } from "@/lib/seo/listing-facts";
import {
	buildCollectionJsonLd,
	buildFaqJsonLd,
} from "@/lib/seo/listing-jsonld";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

/**
 * Reading `searchParams` opts this route into dynamic rendering no matter what,
 * so `revalidate` here is not producing a prerendered page — it sets the default
 * freshness for the cached catalogue reads below. The win over the previous
 * `force-dynamic` is that those reads are now cached at all: `force-dynamic`
 * marks every fetch in the segment as no-store, so each crawl of every category
 * paid a full round-trip to the product service.
 */
export const revalidate = 300;


interface Props {
	params: Promise<{ locale: string; "category-slug": string }>;
	searchParams: Promise<Record<string, string>>;
}

import { type Category, fetchCategory } from "./data";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { locale, "category-slug": slug } = await params;

	const category = await fetchCategory(slug, locale);
	if (!category) return { title: "Category" };

	// Shares its cache entry with the page body, so this costs no extra request.
	const facts = await getCategoryFacts(slug, locale);
	const t = await getTranslations({ locale, namespace: "category" });

	const name: string = category.name;
	const alternates = buildAlternates(locale, `/c/${slug}`);

	// Hand-authored CMS copy always wins; the templates only fill the gap for the
	// long tail of categories nobody has written copy for yet.
	const title: string =
		category.meta_title || t("seo.titleTemplate", { entity: name });

	const description: string =
		category.meta_description ||
		(facts.minPriceFils !== null && facts.total > 0
			? t("seo.descriptionWithPrice", {
					entity: name,
					count: facts.total,
					price: formatAedForLocale(facts.minPriceFils, locale),
				})
			: category.description?.slice(0, 157) ||
				t("seo.descriptionFallback", { entity: name }));

	const keywords: string[] | undefined = category.meta_keywords
		? category.meta_keywords
				.split(",")
				.map((keyword: string) => keyword.trim())
				.filter(Boolean)
		: undefined;

	return {
		title,
		description,
		...(keywords?.length ? { keywords } : {}),
		// Self-referencing canonical to the clean category path so the
		// filter/sort param permutations (?brand, ?sort, ?page…) don't get
		// indexed as duplicate URLs.
		alternates,
		openGraph: {
			type: "website",
			title,
			description,
			url: alternates.canonical,
			...(category.banner_url || category.image_url
				? { images: [category.banner_url || category.image_url] }
				: {}),
		},
	};
}

export default async function CategoryPage({ params, searchParams }: Props) {
	const { locale, "category-slug": slug } = await params;
	const filters = await searchParams;
	setRequestLocale(locale);

	const category = await fetchCategory(slug, locale);

	if (!category) notFound();


	const [banners, productsRes, facts, siteSettings] = await Promise.all([
		// CMS banners scheduled for the top of category pages (admin → CMS → Banners).
		publicGet<CmsBanner[]>("/banners/active", {
			params: { placement: "category_top", locale },
			revalidate: TTL.cmsContent,
			tags: ["banners"],
			locale,
		})
			.then(async (data) =>
				bannersToSlides(data, (await getTranslations({ locale, namespace: "home" }))("shopNow")),
			),
		publicGet<{
			// biome-ignore lint/suspicious/noExplicitAny: untyped API response shape
			data?: any[];
			total?: number;
			// biome-ignore lint/suspicious/noExplicitAny: untyped API response shape
			facets?: any;
		}>("/products", {
			params: buildListingParams(slug, filters, 24, locale),
			revalidate: TTL.productListing,
			tags: ["products", `category:${slug}`],
			locale,
					// null means the product service did not answer: say so, rather
			// than presenting an outage as an empty category.
		}).then((data) => data ?? { data: [], total: 0, facets: undefined, failed: true as const }),
		getCategoryFacts(slug, locale),
		publicGet<Record<string, string>>("/site-settings", {
			params: { keys: "marketplace_return_window_days" },
			revalidate: TTL.categoryTree,
			tags: ["site-settings"],
			locale,
		}),
	]);

	const t = await getTranslations({ locale, namespace: "category" });
	const tb = await getTranslations({ locale, namespace: "browse" });

	// A subcategory wears its top-level category's stock: the first breadcrumb
	// entry is the root of the tree. Matching the subcategory slug itself would
	// misfile e.g. "paper-bags" under papers rather than packaging.
	// biome-ignore lint/suspicious/noExplicitAny: untyped API response shape
	const rootSlug: string = (category.breadcrumb?.[0] as any)?.slug ?? slug;
	const stock = stockFor(rootSlug);

	const headerFacts = [
		...(facts.total > 0
			? [
					{
						label: tb("factProducts"),
						value: new Intl.NumberFormat(locale === "ar" ? "ar-AE" : "en-AE").format(
							facts.total,
						),
					},
				]
			: []),
		...(facts.minPriceFils !== null && facts.total > 0
			? [
					{
						label: tb("factFrom"),
						value: `AED ${formatFils(facts.minPriceFils, locale)}`,
					},
				]
			: []),
	];

	// The trailing crumb is the page you are already on: rendering it as a link
	// to itself adds a self-referencing BreadcrumbList item, which schema.org
	// advises against. Dropping the slug makes it plain text in both the visible
	// trail and the JSON-LD the Breadcrumb component emits.
	const breadcrumbSource: Array<{ name: string; slug?: string }> = category
		.breadcrumb?.length
		? // biome-ignore lint/suspicious/noExplicitAny: untyped API response shape
			category.breadcrumb.map((part: any) => ({
				name: part.name,
				slug: part.slug,
			}))
		: [{ name: category.name }];
	const breadcrumbItems = breadcrumbSource.map((crumb, index) =>
		index === breadcrumbSource.length - 1 ? { name: crumb.name } : crumb,
	);

	const facetConfig = {
		brands: productsRes.facets?.brands || [],
		vendors: productsRes.facets?.vendors || [],
		attributes: productsRes.facets?.attributes || [],
		priceRange: productsRes.facets?.priceRange || { min: 0, max: 100000 },
		plasticBanReady: plasticBanFacetCount(productsRes.facets),
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
		entityName: category.name,
		total: facts.total,
		minPriceFils: facts.minPriceFils,
		formatPrice: (fils) => formatAedForLocale(fils, locale),
		brandLabels: facts.brands.map((brand) => brand.label),
		brandCount: facts.brands.length,
		returnWindowDays: Number.isFinite(returnWindowDays)
			? returnWindowDays
			: null,
		t,
	});

	const collectionJsonLd = buildCollectionJsonLd({
		locale,
		path: `/c/${slug}`,
		name: category.name,
		description: category.meta_description || category.description,
		products: productsRes.data || [],
	});
	const faqJsonLd = buildFaqJsonLd(faq);

	return (
		<div className="mx-auto max-w-[1400px] px-4 pb-4 md:px-8">
			<ListingHeader
				breadcrumbItems={breadcrumbItems}
				title={category.name}
				intro={category.description || undefined}
				stock={stock}
				facts={headerFacts}
				pillsLabel={tb("subcategories")}
				pills={(category.children ?? []).map(
					// biome-ignore lint/suspicious/noExplicitAny: untyped API response shape
					(child: any) => ({
						name: child.name,
						href: `/${locale}/c/${child.slug}`,
					}),
				)}
			/>

			{banners.length > 0 && (
				<div className="mb-8">
					<HeroBanner banners={banners} />
				</div>
			)}

			<ListingResults
				config={facetConfig}
				products={productsRes.data || []}
				total={productsRes.total || 0}
				activeCount={activeCount}
				isError={"failed" in productsRes}
			/>

			<CategoryQuoteBand locale={locale} categorySlug={slug} categoryName={category.name} supplierCount={facetConfig.vendors.length} />

			<ListingSeoContent
				locale={locale}
				entityName={category.name}
				facts={facts}
				faq={faq}
			/>

			<div className="mt-10 md:mt-16">
				<CategoryFooterLayout
					categorySlug={slug}
					categoryId={category.id}
					locale={locale}
				/>
			</div>

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
