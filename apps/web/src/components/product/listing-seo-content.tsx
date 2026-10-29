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
 * almost nothing to match a query like "how much is lipstick in the UAE"
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
		<section className="border-t border-nl-cacao/10 px-2 py-10 md:px-8 md:py-14">
			<div className="grid gap-10 md:mx-auto md:max-w-[1400px] md:grid-cols-2 md:gap-16">
				{hasFacts && (
					<div>
						<h2 className="font-serif text-[26px] leading-tight text-nl-cacao md:text-[32px]">
							{t("seo.aboutHeading", { entity: entityName })}
						</h2>

						<div className="mt-4 space-y-3 text-[15px] leading-relaxed text-nl-cacao/75">
							<p>
								{t(INTRO_KEY[variant], {
									entity: entityName,
									count: facts.total,
									brandCount: facts.brands.length,
								})}
							</p>

							{facts.minPriceFils !== null && (
								<p>
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
								<span className="block text-[10px] uppercase tracking-[0.3em] text-nl-russet">
									{t("seo.brandsHeading")}
								</span>
								<div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
									{linkedBrands.map((brand) => (
										<Link
											key={brand.value}
											href={`/${locale}/brand/${brand.value}`}
											className="text-[13px] text-nl-cacao/80 underline decoration-nl-cacao/20 underline-offset-4 transition-colors hover:text-nl-cacao hover:decoration-nl-amber"
										>
											{brand.label}
										</Link>
									))}
								</div>
							</div>
						)}
					</div>
				)}

				{faq.length > 0 && (
					<div>
						<h2 className="font-serif text-[26px] leading-tight text-nl-cacao md:text-[32px]">
							{t("seo.faqHeading")}
						</h2>

						<dl className="mt-4 divide-y divide-nl-cacao/10 border-t border-nl-cacao/10">
							{faq.map((entry) => (
								<div key={entry.question} className="py-4">
									<dt className="text-[14px] font-medium text-nl-cacao">
										{entry.question}
									</dt>
									<dd className="mt-1.5 text-[15px] leading-relaxed text-nl-cacao/75">
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
