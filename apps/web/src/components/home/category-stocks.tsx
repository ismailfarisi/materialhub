import { ScrollRail } from "@/components/layout/scroll-rail";
import { STOCKS, STOCK_ORDER, SectionHead } from "@/components/swatch";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { CSSProperties } from "react";

/**
 * The home page's category-stock row: the seven top-level categories as tall
 * swatch blades, each a whole field of its stock colour with a white label
 * panel, like the leaves of a swatch book laid side by side. Each blade opens
 * its category. Seven columns from `lg`; a snap rail below that.
 */
export async function CategoryStocks({
	locale,
	headingLevel = "h2",
}: {
	locale: string;
	headingLevel?: "h1" | "h2";
}) {
	const t = await getTranslations({ locale, namespace: "home" });

	return (
		<section
			id="materials"
			aria-labelledby="materials-heading"
			data-section="category-stocks"
			className="max-w-[1400px] mx-auto px-4 md:px-8 grid gap-5 md:gap-6 scroll-mt-24"
		>
			<SectionHead
				as={headingLevel}
				title={<span id="materials-heading">{t("shopByMaterial")}</span>}
				action={{ href: `/${locale}/search`, label: t("allCategories") }}
			/>
			<ScrollRail className="flex gap-2.5 overflow-x-auto scrollbar-hide snap-x snap-mandatory -mx-4 px-4 pt-2 pb-4 scroll-ps-4 md:-mx-8 md:px-8 md:scroll-ps-8 lg:mx-0 lg:px-0 lg:grid lg:grid-cols-7 lg:gap-3 lg:overflow-visible">
				{STOCK_ORDER.map((key) => {
					const stock = STOCKS[key];
					return (
						<Link
							key={key}
							href={`/${locale}/c/${stock.slug}`}
							data-stock={key}
							style={{ "--stock": stock.color } as CSSProperties}
							className="group relative flex flex-none snap-start flex-col w-[156px] h-[244px] sm:w-[176px] md:h-[272px] lg:w-auto lg:h-[312px] overflow-hidden rounded-md bg-[var(--stock)] shadow-card transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1.5 hover:shadow-lift focus-visible:-translate-y-1.5 focus-visible:shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:focus-visible:translate-y-0"
						>
							{/* Punched binding hole, as on every leaf of the book. */}
							<span
								aria-hidden="true"
								className="absolute top-3 end-3 h-3 w-3 rounded-full bg-nl-linen shadow-[inset_0_1px_1px_rgb(0_0_0/0.35)]"
							/>
							<span className="flex flex-1 items-end p-3.5 md:p-4">
								<span className="font-display font-semibold text-[17px] md:text-[19px] leading-[1.1] tracking-[-0.015em] text-white text-balance">
									{t(`stocks.${key}.name`)}
								</span>
							</span>
							<span className="flex min-h-[40%] flex-col justify-between gap-2 bg-nl-pearl p-3.5 md:p-4">
								<span className="text-[12.5px] leading-[1.4] text-nl-russet line-clamp-3">
									{t(`stocks.${key}.contents`)}
								</span>
								<ArrowRight
									aria-hidden="true"
									className="h-4 w-4 text-nl-cacao transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
									strokeWidth={1.75}
								/>
							</span>
						</Link>
					);
				})}
			</ScrollRail>
		</section>
	);
}
