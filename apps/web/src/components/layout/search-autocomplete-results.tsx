"use client";

import { PriceTag, stockFor } from "@/components/swatch";
import type { SuggestResponse } from "@/lib/queries/search";
import { cn } from "@/lib/utils";
import { ArrowRight, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import { useRouter } from "next/navigation";

interface Props {
	data: SuggestResponse;
	query: string;
	activeIndex: number;
	onSelect: () => void;
	/** Inline in the mobile overlay rather than a floating panel. */
	inline?: boolean;
}

/** Shared surface for the header dropdown and its empty/no-result states. */
export const SEARCH_PANEL =
	"overflow-hidden rounded-md border border-nl-cacao/12 bg-nl-pearl shadow-lift";

const chip =
	"inline-flex h-8 items-center gap-2 rounded-sm border px-2.5 text-[13px] text-nl-cacao transition-colors";

/**
 * Suggestions as the buyer types: categories (with their stock chip), brands,
 * then products with price. Rows are buttons fired on mouse-down so they beat
 * the input's blur; `activeIndex` mirrors arrow-key focus from the input.
 */
export function SearchAutocompleteResults({
	data,
	query,
	activeIndex,
	onSelect,
	inline = false,
}: Props) {
	const router = useRouter();
	const locale = useLocale();
	const t = useTranslations("browse");

	const go = (href: string) => {
		router.push(href);
		onSelect();
	};

	return (
		<div className={inline ? "" : SEARCH_PANEL}>
			{data.categories.length > 0 && (
				<div className="border-b border-nl-cacao/10 p-3">
					<p className="mill-label m-0 mb-2 text-nl-russet">{t("categoriesHeading")}</p>
					<div className="flex flex-wrap gap-1.5">
						{data.categories.map((c, i) => {
							const stock = stockFor(c.slug || c.name);
							return (
								<button
									key={c.id}
									type="button"
									className={cn(
										chip,
										activeIndex === i
											? "border-nl-cacao bg-nl-linen"
											: "border-nl-cacao/15 hover:border-nl-cacao/50",
									)}
									onMouseDown={() => go(`/${locale}/c/${c.slug}`)}
								>
									<span
										aria-hidden="true"
										className="h-2.5 w-2.5 rounded-[2px]"
										style={{ background: stock.color }}
									/>
									{c.name}
								</button>
							);
						})}
					</div>
				</div>
			)}
			{data.brands.length > 0 && (
				<div className="border-b border-nl-cacao/10 p-3">
					<p className="mill-label m-0 mb-2 text-nl-russet">{t("brandsHeading")}</p>
					<div className="flex flex-wrap gap-1.5">
						{data.brands.map((b, i) => {
							const idx = data.categories.length + i;
							return (
								<button
									key={b.id}
									type="button"
									className={cn(
										chip,
										activeIndex === idx
											? "border-nl-cacao bg-nl-linen"
											: "border-nl-cacao/15 hover:border-nl-cacao/50",
									)}
									onMouseDown={() => go(`/${locale}/brand/${b.slug}`)}
								>
									{b.name}
								</button>
							);
						})}
					</div>
				</div>
			)}
			{data.products.length > 0 && (
				<div className="p-1.5">
					<p className="mill-label m-0 px-1.5 pt-1.5 pb-1 text-nl-russet">{t("productsHeading")}</p>
					{data.products.map((p, i) => {
						const idx = data.categories.length + data.brands.length + i;
						return (
							<button
								key={p.id}
								type="button"
								className={cn(
									"flex w-full items-center gap-3 rounded-sm px-1.5 py-1.5 text-start transition-colors",
									idx === activeIndex ? "bg-nl-linen" : "hover:bg-nl-linen/70",
								)}
								onMouseDown={() => go(`/${locale}/product/${p.slug}`)}
							>
								<div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-sm bg-nl-linen">
									{p.image_url && (
										<Image
											src={p.image_url}
											alt=""
											fill
											sizes="44px"
											className="object-cover"
										/>
									)}
								</div>
								<div className="grid min-w-0 flex-1 gap-0.5">
									<span className="truncate text-[14px] font-medium text-nl-cacao">{p.name}</span>
									<PriceTag
										amount={p.price_min}
										max={p.price_max !== p.price_min ? p.price_max : null}
										locale={locale}
										size="sm"
									/>
								</div>
							</button>
						);
					})}
				</div>
			)}
			<div className="border-t border-nl-cacao/10 p-1.5">
				<button
					type="button"
					className="flex w-full items-center gap-2.5 rounded-sm px-2 py-2.5 text-start text-[14px] font-medium text-nl-cacao hover:bg-nl-linen/70"
					onMouseDown={() => go(`/${locale}/search?q=${encodeURIComponent(query.trim())}`)}
				>
					<Search className="h-4 w-4 text-nl-russet" strokeWidth={1.75} aria-hidden="true" />
					<span className="min-w-0 flex-1 truncate">{t("viewAllFor", { query: query.trim() })}</span>
					<ArrowRight className="h-4 w-4 text-nl-russet rtl:rotate-180" strokeWidth={1.75} aria-hidden="true" />
				</button>
			</div>
		</div>
	);
}
