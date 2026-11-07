import { formatAedForLocale } from "@/lib/money";
import type { ListingFacts } from "@/lib/seo/listing-facts";
import type { FaqEntry } from "@/lib/seo/listing-jsonld";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

interface Props {
	locale: string;
	/** The thing being listed — a category name or a brand name. */
	entityName: string;
	facts: ListingFacts;
	/** Built by `buildListingFaq` — the same entries the page marks up as FAQPage. */
	faq: FaqEntry[];
	/**
	 * Selects the intro sentence, and whether brand links render at all. A brand
	 * page is pinned to one brand, so counting brands there would read as nonsense
	 * and linking them would link the page to itself; a curated collection gets no
	 * brand facets back from its endpoint in the first place.
	 */
	variant?: "category" | "brand" | "collection";
}

const INTRO_KEY = {
	category: "seo.aboutIntro",
	brand: "seo.aboutIntroBrand",
	collection: "seo.aboutIntroCollection",
} as const;

/** Brands linked in the copy before the row turns into a link farm. */
const MAX_LINKED_BRANDS = 8;

/**
 * Crawlable copy at the foot of a product listing: what the listing holds, what
 * it costs, which brands are in it, and the questions a shopper asks before
 * buying. A listing page whose only text is product-card titles gives Google
 * almost nothing to match a query like "how much is greyboard in the UAE"
 * against, and nothing to rank on beyond the category name itself.
 *
 * Every sentence is generated from live data — count, price floor, brand facets,
 * configured return window — rather than boilerplate, and the block collapses to
 * nothing when there is no data to state. It is not a substitute for
 * hand-written copy: the `description` and `meta_description` CMS fields on
 * categories and brands remain the place for editorial voice, and this renders
 * underneath whatever those provide.
 *
 * The FAQ entries are passed in rather than built here so the visible copy and
 * the FAQPage markup emitted by the page come from one call to
 * `buildListingFaq`. If they diverged, the markup would describe content the
 * user cannot see.
 */
export async function ListingSeoContent({
	locale,
	entityName,
	facts,
	faq,
	variant = "category",
}: Props) {
	const t = await getTranslations({ locale, namespace: "category" });

	const hasFacts = facts.total > 0;
	if (!hasFacts && faq.length === 0) return null;

	const linkedBrands =
		variant === "category" ? facts.brands.slice(0, MAX_LINKED_BRANDS) : [];

	return (
		<section className="mt-14 border-t border-nl-cacao/12 pt-10 pb-6 md:mt-20 md:pt-14">
			<div className="grid gap-10 md:grid-cols-2 md:gap-16">
				{hasFacts && (
					<div>
						<h2 className="m-0 font-display text-[clamp(1.375rem,2.6vw,2rem)] font-semibold leading-[1.08] tracking-[-0.02em] text-nl-cacao">
							{t("seo.aboutHeading", { entity: entityName })}
						</h2>

						<div className="mt-4 grid max-w-[65ch] gap-3 text-[15px] leading-relaxed text-nl-russet">
							<p className="m-0">
								{t(
									// "from 0 brands" reads as broken; with no brand facets use
									// the sentence that doesn't count brands.
									variant === "category" && facts.brands.length === 0
										? INTRO_KEY.brand
										: INTRO_KEY[variant],
									{
									entity: entityName,
									count: facts.total,
									brandCount: facts.brands.length,
									},
								)}
							</p>

							{facts.minPriceFils !== null && (
								<p className="m-0">
									{t("seo.aboutPrice", {
										entity: entityName,
										price: formatAedForLocale(facts.minPriceFils, locale),
									})}{" "}
									{t("seo.aboutVat")}
								</p>
							)}
						</div>

						{linkedBrands.length > 0 && (
							<div className="mt-7">
								<h3 className="mill-label m-0 text-nl-russet">
									{t("seo.brandsHeading")}
								</h3>
								<ul className="m-0 mt-3 flex list-none flex-wrap gap-2 p-0">
									{linkedBrands.map((brand) => (
										<li key={brand.value}>
											<Link
												href={`/${locale}/brand/${brand.value}`}
												className="inline-flex h-9 items-center rounded-sm border border-nl-cacao/15 bg-nl-pearl px-3 text-[13.5px] text-nl-cacao transition-colors hover:border-nl-cacao/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber"
											>
												{brand.label}
											</Link>
										</li>
									))}
								</ul>
							</div>
						)}
					</div>
				)}

				{faq.length > 0 && (
					<div>
						<h2 className="m-0 font-display text-[clamp(1.375rem,2.6vw,2rem)] font-semibold leading-[1.08] tracking-[-0.02em] text-nl-cacao">
							{t("seo.faqHeading")}
						</h2>

						<dl className="m-0 mt-4 border-t-2 border-nl-cacao">
							{faq.map((entry) => (
								<div key={entry.question} className="border-b border-nl-cacao/12 py-4">
									<dt className="font-display text-[15.5px] font-semibold leading-snug tracking-[-0.01em] text-nl-cacao">
										{entry.question}
									</dt>
									<dd className="m-0 mt-1.5 max-w-[65ch] text-[15px] leading-relaxed text-nl-russet">
										{entry.answer}
									</dd>
								</div>
							))}
						</dl>
					</div>
				)}
			</div>
		</section>
	);
}
