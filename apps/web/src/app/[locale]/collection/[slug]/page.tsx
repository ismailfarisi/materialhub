import { ListingHeader } from "@/components/product/listing-header";
import { ListingSeoContent } from "@/components/product/listing-seo-content";
import { Pagination } from "@/components/product/pagination";
import { ProductGrid } from "@/components/product/product-grid";
import { SortToolbar } from "@/components/product/sort-toolbar";
import { TTL, publicGet } from "@/lib/api-public";
import { formatAedForLocale } from "@/lib/money";
import { buildAlternates } from "@/lib/seo/alternates";
import type { ListingFacts } from "@/lib/seo/listing-facts";
import { buildListingFaq } from "@/lib/seo/listing-faq";
import {
	buildCollectionJsonLd,
	buildFaqJsonLd,
} from "@/lib/seo/listing-jsonld";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

/**
 * Sort and page live in `searchParams`, so this route stays dynamically
 * rendered; `revalidate` sets the lifetime of the cached collection read. Under
 * the previous `force-dynamic` that read was marked no-store, so every crawl
 * re-resolved the collection's pins, rules and exclusions from scratch.
 */
export const revalidate = 300;

const PER_PAGE = 24;

/**
 * Sorts the collection endpoint understands (ProductCollectionSort). The shared
 * SortToolbar also offers "relevance", which is a search-only concept — a
 * curated collection has a custom order instead. Anything unrecognised is
 * dropped so the collection falls back to its own default_sort rather than
 * pushing an unknown sortBy into Typesense.
 */
const COLLECTION_SORTS = new Set([
	"custom",
	"price_asc",
	"price_desc",
	"newest",
	"rating",
]);

function collectionSort(raw?: string): string | undefined {
	return raw && COLLECTION_SORTS.has(raw) ? raw : undefined;
}

interface Props {
	params: Promise<{ locale: string; slug: string }>;
	searchParams: Promise<Record<string, string>>;
}

interface CollectionResponse {
	// biome-ignore lint/suspicious/noExplicitAny: untyped API response shape
	collection?: any;
	// biome-ignore lint/suspicious/noExplicitAny: untyped API response shape
	items?: any[];
	total?: number;
}

function fetchCollection(
	locale: string,
	slug: string,
	search: Record<string, string>,
) {
	const sort = collectionSort(search.sort);
	const page = Number(search.page) || 1;

	return publicGet<CollectionResponse>(
		`/collections/${encodeURIComponent(slug)}`,
		{
			params: {
				page,
				perPage: PER_PAGE,
				...(sort ? { sort } : {}),
			},
			revalidate: TTL.productListing,
			tags: [`collection:${slug}`],
			locale,
		},
	);
}

/**
 * A collection's price floor is only knowable when the whole collection fits on
 * the page we fetched: the endpoint returns no facets and no aggregate range, so
 * with more products than `PER_PAGE` the cheapest one may well be on a page we
 * have not seen, whatever the sort order. Rather than publish "starts from" off a
 * partial set, the price is dropped and the copy simply omits it.
 */
function collectionFacts(data: CollectionResponse): ListingFacts {
	const items = data.items ?? [];
	const total = data.total ?? 0;
	const prices = items
		.map((item) => item?.price_min)
		.filter((price): price is number => typeof price === "number");

	const complete = total > 0 && total <= PER_PAGE && prices.length > 0;

	return {
		total,
		minPriceFils: complete ? Math.min(...prices) : null,
		brands: [],
	};
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { locale, slug } = await params;

	// Page 1, unsorted — the canonical view, and the same cache entry the page
	// body uses for any visitor who has not paged or re-sorted.
	const data = await fetchCollection(locale, slug, {});
	if (!data?.collection) return { title: "Collection" };

	const t = await getTranslations({ locale, namespace: "category" });

	const name: string = data.collection.name;
	const total = data.total ?? 0;
	const alternates = buildAlternates(locale, `/collection/${slug}`);

	// The previous title was `${name} — MaterialHub`, which the root layout's
	// "%s | MaterialHub" template rendered as "… — MaterialHub | MaterialHub". The brand
	// suffix belongs to the template alone.
	const title: string = t("seo.titleTemplateCollection", { entity: name });

	const description: string =
		data.collection.description?.slice(0, 157) ||
		(total > 0
			? t("seo.descriptionCollection", { entity: name, count: total })
			: t("seo.descriptionFallback", { entity: name }));

	return {
		title,
		description,
		// Self-referencing canonical so the sort/page permutations don't get
		// indexed as duplicate collection URLs.
		alternates,
		openGraph: {
			type: "website",
			title,
			description,
			url: alternates.canonical,
		},
	};
}

export default async function CollectionPage({ params, searchParams }: Props) {
	const { locale, slug } = await params;
	const search = await searchParams;
	setRequestLocale(locale);

	const data = await fetchCollection(locale, slug, search);
	if (!data?.collection) notFound();

	const siteSettings = await publicGet<Record<string, string>>(
		"/site-settings",
		{
			params: { keys: "marketplace_return_window_days" },
			revalidate: TTL.categoryTree,
			tags: ["site-settings"],
			locale,
		},
	);

	const t = await getTranslations({ locale, namespace: "category" });

	const products = data.items || [];
	const total = data.total || 0;
	const facts = collectionFacts(data);

	const returnWindowDays = Number.parseInt(
		siteSettings?.marketplace_return_window_days ?? "",
		10,
	);

	const faq = buildListingFaq({
		entityName: data.collection.name,
		total: facts.total,
		minPriceFils: facts.minPriceFils,
		formatPrice: (fils) => formatAedForLocale(fils, locale),
		// The collection endpoint returns no brand facets, so the "which brands"
		// entry has nothing to answer from and `buildListingFaq` drops it.
		brandLabels: [],
		brandCount: 0,
		returnWindowDays: Number.isFinite(returnWindowDays)
			? returnWindowDays
			: null,
		t,
	});

	const collectionJsonLd = buildCollectionJsonLd({
		locale,
		path: `/collection/${slug}`,
		name: data.collection.name,
		description: data.collection.description,
		products,
	});
	const faqJsonLd = buildFaqJsonLd(faq);

	return (
		<div className="mx-auto max-w-[1400px] py-4">
			<ListingHeader
				breadcrumbItems={[{ name: data.collection.name }]}
				title={data.collection.name}
				intro={data.collection.description || undefined}
			/>

			{/* No filter sidebar: a collection is a curated set (pins, rules and
			    exclusions resolved server-side) and the endpoint returns no facets,
			    so filter controls here would be inert. Sort and paging are real. */}
			<div className="mt-2 px-2 md:px-8">
				<SortToolbar totalResults={total} />
				<ProductGrid products={products} view={search.view} />
				<Pagination totalItems={total} pageSize={PER_PAGE} />
			</div>

			<ListingSeoContent
				locale={locale}
				entityName={data.collection.name}
				facts={facts}
				faq={faq}
				variant="collection"
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
