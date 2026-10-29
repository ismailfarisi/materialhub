import { filsToAed } from "../money";
import { absoluteUrl } from "./alternates";

/**
 * The subset of a listing row this module needs. Deliberately loose — the
 * `/products` payload is not yet typed and rows are skipped rather than trusted
 * when a required field is missing.
 */
export interface ListingProduct {
	slug?: string | null;
	name?: string | null;
	price_min?: number | null;
	images?: Array<{ url?: string | null }> | null;
}

export interface FaqEntry {
	question: string;
	answer: string;
}

export interface CollectionJsonLdInput {
	locale: string;
	/** Locale-less path, e.g. "/c/lipstick". */
	path: string;
	name: string;
	description?: string | null;
	products: ListingProduct[];
	/**
	 * The entity the listing is *about*, when it is pinned to one — the `Brand` on
	 * a brand page. Lets Google tie the page to a known entity instead of reading
	 * it as an arbitrary set of products.
	 */
	about?: { "@type": "Brand"; name: string; logo?: string } | null;
}

/**
 * `CollectionPage` wrapping an `ItemList` of the products rendered on a product
 * listing — category, brand or curated collection. These pages previously
 * emitted no schema.org markup at all beyond breadcrumbs, so Google had to infer
 * from the DOM that the page was a product listing rather than an article or a
 * landing page.
 *
 * `numberOfItems` counts the items actually present in `itemListElement` — not
 * the total result count — because a list that claims 4,000 members while
 * enumerating 24 is a structured-data mismatch.
 */
export function buildCollectionJsonLd({
	locale,
	path,
	name,
	description,
	products,
	about,
}: CollectionJsonLdInput) {
	const url = absoluteUrl(locale, path);

	const itemListElement = products
		.filter((product) => product.slug && product.name)
		.map((product, index) => {
			const productUrl = absoluteUrl(locale, `/product/${product.slug}`);
			const image = product.images?.[0]?.url;

			return {
				"@type": "ListItem" as const,
				position: index + 1,
				url: productUrl,
				item: {
					"@type": "Product" as const,
					name: product.name,
					url: productUrl,
					...(image ? { image } : {}),
					// Availability is intentionally omitted: the listing payload
					// carries no per-row stock field, and guessing "InStock" from
					// the default in-stock filter would be wrong the moment a
					// shopper opts into out-of-stock results.
					...(typeof product.price_min === "number"
						? {
								offers: {
									"@type": "Offer" as const,
									price: filsToAed(product.price_min),
									priceCurrency: "AED",
								},
							}
						: {}),
				},
			};
		});

	return {
		"@context": "https://schema.org",
		"@type": "CollectionPage",
		name,
		url,
		...(description ? { description } : {}),
		...(about ? { about } : {}),
		mainEntity: {
			"@type": "ItemList",
			numberOfItems: itemListElement.length,
			itemListElement,
		},
	};
}

/**
 * `FAQPage` for the questions rendered at the foot of a product listing.
 *
 * Returns `null` for an empty list so the caller can skip the `<script>` tag
 * entirely rather than publish an empty mainEntity. Every entry passed in must
 * also be rendered visibly on the page — Google treats markup describing
 * content a user cannot see as a structured-data violation.
 */
export function buildFaqJsonLd(entries: FaqEntry[]) {
	if (entries.length === 0) return null;

	return {
		"@context": "https://schema.org",
		"@type": "FAQPage",
		mainEntity: entries.map((entry) => ({
			"@type": "Question" as const,
			name: entry.question,
			acceptedAnswer: {
				"@type": "Answer" as const,
				text: entry.answer,
			},
		})),
	};
}
