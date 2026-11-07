"use client";

import { STOCKS, STOCK_ORDER, StockChip, stockFor } from "@/components/swatch";
import { cn } from "@/lib/utils";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import type { CSSProperties } from "react";

interface Category {
	id: string;
	name: string;
	slug: string;
	icon_url?: string;
}

/**
 * Horizontal category tabs: a stock chip and the category name, with a 2px
 * underline in the category's stock on hover and when active (DESIGN.md,
 * Navigation). Not mounted on the home page, which uses the category-stock
 * row; kept for listing pages that want a compact strip. Without a category
 * list it falls back to the seven top-level stocks.
 */
export function CategoryBar({
	categories,
	activeSlug,
}: {
	categories?: Category[];
	activeSlug?: string;
}) {
	const locale = useLocale();
	const t = useTranslations("home");
	const tCommon = useTranslations("common");
	const items: Category[] =
		categories && categories.length > 0
			? categories
			: STOCK_ORDER.map((k) => ({
					id: k,
					slug: STOCKS[k].slug,
					name: t(`stocks.${k}.name`),
				}));

	return (
		<nav aria-label={tCommon("categories")} className="border-b border-nl-cacao/10">
			<ul className="mx-auto max-w-[1400px] flex gap-1 overflow-x-auto scrollbar-hide px-4 md:px-8 list-none m-0">
				{items.map((cat) => {
					const stock = stockFor(cat.slug || cat.name);
					const active = cat.slug === activeSlug;
					return (
						<li key={cat.id} className="shrink-0">
							<Link
								href={`/${locale}/c/${cat.slug}`}
								aria-current={active ? "page" : undefined}
								style={{ "--stock": stock.color } as CSSProperties}
								className={cn(
									"relative inline-flex h-11 items-center gap-2 px-3 text-sm font-medium text-nl-cacao whitespace-nowrap",
									"after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-[var(--stock)] after:transition-transform after:duration-150 after:origin-left rtl:after:origin-right",
									active
										? "after:scale-x-100"
										: "after:scale-x-0 hover:after:scale-x-100",
									"focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-nl-amber",
								)}
							>
								<StockChip stock={stock} />
								{cat.name}
							</Link>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}
