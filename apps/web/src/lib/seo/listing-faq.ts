import type { FaqEntry } from "./listing-jsonld";

/** Minimal shape of a next-intl translator, kept structural so this stays pure. */
export type FaqTranslator = (
	key: string,
	values?: Record<string, string | number>,
) => string;

export interface ListingFaqInput {
	/** The thing being listed — a category name or a brand name. */
	entityName: string;
	/** Unfiltered, in-stock product count for the listing. */
	total: number;
	/** Cheapest in-stock product in the listing, in fils. Null when unknown. */
	minPriceFils?: number | null;
	/** Formats fils for display, e.g. `(4500) => "AED 45"`. */
	formatPrice: (fils: number) => string;
	/** Brand labels to name in the answer; the count comes from the full list. */
	brandLabels: string[];
	brandCount: number;
	/** Marketplace return window, from site settings. Null when unavailable. */
	returnWindowDays?: number | null;
	t: FaqTranslator;
}

/** Brands named inline in the answer before it turns into a wall of nouns. */
const MAX_NAMED_BRANDS = 5;

/**
 * The questions rendered at the foot of a product-listing page, and the ones fed
 * to `buildFaqJsonLd`. Both come from here so the visible copy and the
 * structured data can never drift apart.
 *
 * Every answer is derived from data we actually hold — live price floor, live
 * brand facets, the configured return window, and the VAT-inclusive pricing the
 * checkout implements (order-creation.service.ts computes tax as
 * `subtotal - subtotal / 1.05`). An entry is omitted entirely rather than
 * answered with a plausible guess, because a listing page publishing a confident
 * wrong answer about price or returns is worse than one saying nothing.
 *
 * Brand pages pass an empty `brandLabels`, which drops the "which brands" entry:
 * a page already pinned to one brand has nothing to answer there.
 */
export function buildListingFaq({
	entityName,
	total,
	minPriceFils,
	formatPrice,
	brandLabels,
	brandCount,
	returnWindowDays,
	t,
}: ListingFaqInput): FaqEntry[] {
	const entries: FaqEntry[] = [];

	if (typeof minPriceFils === "number" && total > 0) {
		entries.push({
			question: t("seo.faqPriceQ", { entity: entityName }),
			answer: t("seo.faqPriceA", {
				entity: entityName,
				price: formatPrice(minPriceFils),
				count: total,
			}),
		});
	}

	if (brandCount > 0 && brandLabels.length > 0) {
		entries.push({
			question: t("seo.faqBrandsQ", { entity: entityName }),
			answer: t("seo.faqBrandsA", {
				entity: entityName,
				brandCount,
				brands: brandLabels.slice(0, MAX_NAMED_BRANDS).join(", "),
			}),
		});
	}

	// Always safe to state: pricing is VAT-inclusive by construction in checkout.
	entries.push({
		question: t("seo.faqVatQ"),
		answer: t("seo.faqVatA", { entity: entityName }),
	});

	if (typeof returnWindowDays === "number" && returnWindowDays > 0) {
		entries.push({
			question: t("seo.faqReturnsQ", { entity: entityName }),
			answer: t("seo.faqReturnsA", {
				entity: entityName,
				days: returnWindowDays,
			}),
		});
	}

	return entries;
}
