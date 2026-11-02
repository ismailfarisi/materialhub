"use client";

import { FanDeck, STOCKS, STOCK_ORDER } from "@/components/swatch";
import { ArrowRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The seven top-level categories as a way back in: the fan deck (decorative,
 * once per page) beside a list of category links, each with its stock chip.
 * Used where a buyer has nothing in front of them — an empty search, a search
 * with no results.
 */
export function CategoryIndex({
	title,
	children,
}: {
	title: ReactNode;
	/** Copy and actions above the category list (the problem and the recovery). */
	children?: ReactNode;
}) {
	const t = useTranslations("browse");
	const locale = useLocale();

	return (
		<section className="grid items-center gap-8 rounded-md bg-nl-pearl p-5 shadow-card md:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] md:gap-12 md:p-10">
			<div className="grid min-w-0 gap-6">
				<div className="grid gap-3">
					<h2 className="m-0 font-display text-[clamp(1.375rem,2.6vw,2rem)] font-semibold leading-[1.08] tracking-[-0.02em] text-nl-cacao [overflow-wrap:anywhere]">
						{title}
					</h2>
					{children}
				</div>
				<nav aria-label={t("browseCategories")}>
					<h3 className="mill-label m-0 mb-2 text-nl-russet">{t("browseCategories")}</h3>
					<ul className="m-0 grid list-none border-t border-nl-cacao/12 p-0 sm:grid-cols-2 sm:gap-x-6">
						{STOCK_ORDER.map((k) => {
							const stock = STOCKS[k];
							return (
								<li key={k} className="border-b border-nl-cacao/12">
									<Link
										href={`/${locale}/c/${stock.slug}`}
										className="group flex min-h-12 items-center gap-3 rounded-sm text-[15px] font-medium text-nl-cacao focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber"
									>
										<span
											aria-hidden="true"
											className="h-3 w-3 shrink-0 rounded-[2px]"
											style={{ background: stock.color }}
										/>
										<span className="flex-1">{t(`categories.${stock.slug}`)}</span>
										<ArrowRight
											aria-hidden="true"
											className="h-4 w-4 text-nl-russet transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-nl-cacao rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
											strokeWidth={1.75}
										/>
									</Link>
								</li>
							);
						})}
					</ul>
				</nav>
			</div>
			<FanDeck className="mx-auto hidden max-w-[440px] md:block" />
		</section>
	);
}
