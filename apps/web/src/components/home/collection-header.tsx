import {
	STOCKS,
	STOCK_ORDER,
	type StockKey,
	StockChip,
} from "@/components/swatch";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { matchStock } from "./stock-match";

interface ItemLike {
	category_name?: string | null;
	category_slug?: string | null;
}

/** Count the products on hand per category stock, in stock order. */
export function stockMix(
	items: ItemLike[],
): Array<{ key: StockKey; count: number }> {
	const counts = new Map<StockKey, number>();
	for (const item of items) {
		const stock = matchStock(item?.category_slug, item?.category_name);
		if (stock) counts.set(stock.key, (counts.get(stock.key) ?? 0) + 1);
	}
	return STOCK_ORDER.filter((k) => counts.has(k)).map((k) => ({
		key: k,
		count: counts.get(k) ?? 0,
	}));
}

/**
 * Collection landing header: breadcrumb, display title, intro, product count
 * and the materials the collection draws on. The proportional stock bar is
 * drawn only when every product is on this page (`complete`), so its shares
 * are true; otherwise the chips alone list the categories present.
 */
export async function CollectionHeader({
	locale,
	title,
	intro,
	total,
	items,
	complete,
}: {
	locale: string;
	title: string;
	intro?: string | null;
	total: number;
	items: ItemLike[];
	complete: boolean;
}) {
	const t = await getTranslations({ locale, namespace: "home" });
	const mix = stockMix(items);
	const counted = mix.reduce((n, m) => n + m.count, 0);

	return (
		<header className="grid gap-5 md:gap-6 pt-6 pb-8 md:pt-10 md:pb-10">
			<nav aria-label="Breadcrumb">
				<ol className="flex flex-wrap items-center gap-1.5 list-none m-0 p-0 text-[13px] text-nl-russet">
					<li>
						<Link
							href={`/${locale}`}
							className="underline decoration-nl-cacao/25 underline-offset-2 hover:text-nl-cacao hover:decoration-nl-amber"
						>
							{t("collection.breadcrumbHome")}
						</Link>
					</li>
					<li aria-hidden="true">/</li>
					<li
						aria-current="page"
						className="text-nl-cacao truncate max-w-[40ch]"
					>
						{title}
					</li>
				</ol>
			</nav>

			<div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:gap-12">
				<div className="grid gap-4 min-w-0">
					<h1 className="m-0 font-display font-bold [font-stretch:112%] text-[clamp(34px,4.6vw,64px)] leading-[1] tracking-[-0.03em] text-nl-cacao text-balance [overflow-wrap:anywhere]">
						{title}
					</h1>
					{intro && (
						<p className="m-0 max-w-[65ch] text-[16px] leading-[1.6] text-nl-russet">
							{intro}
						</p>
					)}
				</div>
				{/* With products, the sort toolbar below carries the count. */}
				{total === 0 && (
					<p className="m-0 font-mono text-[13.5px] tabular-nums text-nl-cacao md:text-end md:pb-1.5">
						{t("collection.itemCount", { count: total })}
					</p>
				)}
			</div>

			{mix.length > 0 && (
				<div className="grid gap-3 pt-4 border-t border-nl-cacao/12">
					<span className="mill-label text-nl-russet">
						{t("collection.materialsIn")}
					</span>
					{complete && counted > 0 && (
						<div
							aria-hidden="true"
							className="flex h-2.5 gap-0.5 overflow-hidden rounded-sm"
						>
							{mix.map((m) => (
								<span
									key={m.key}
									style={{ flexGrow: m.count, background: STOCKS[m.key].color }}
								/>
							))}
						</div>
					)}
					<ul className="flex flex-wrap gap-x-5 gap-y-2 list-none m-0 p-0">
						{mix.map((m) => (
							<li key={m.key}>
								<Link
									href={`/${locale}/c/${STOCKS[m.key].slug}`}
									className="inline-flex items-center gap-2 text-[13.5px] text-nl-cacao hover:underline decoration-nl-amber underline-offset-2"
								>
									<StockChip stock={STOCKS[m.key]} />
									{t(`stocks.${m.key}.name`)}
									{complete && (
										<span className="font-mono text-[12.5px] tabular-nums text-nl-russet">
											{m.count}
										</span>
									)}
								</Link>
							</li>
						))}
					</ul>
				</div>
			)}
		</header>
	);
}
