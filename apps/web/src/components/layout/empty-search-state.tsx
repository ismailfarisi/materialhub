"use client";

import { stockFor } from "@/components/swatch";
import {
	useClearRecentSearches,
	useRecentSearches,
} from "@/lib/queries/recent-searches";
import { useTrendingSearches } from "@/lib/queries/search";
import { cn } from "@/lib/utils";
import { Clock, TrendingUp, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { SEARCH_PANEL } from "./search-autocomplete-results";

interface Props {
	onSelect?: () => void;
	/** Fallback browse chips (e.g. header nav categories) shown when there are no recents/trending. */
	categories?: Array<{ label: string; href: string; isCategory?: boolean }>;
	/** Inline in the mobile overlay rather than a floating panel. */
	inline?: boolean;
}

const chip =
	"inline-flex h-9 items-center gap-2 rounded-sm border border-nl-cacao/15 bg-nl-pearl px-2.5 text-[13.5px] text-nl-cacao transition-colors hover:border-nl-cacao/50";

/**
 * What the search field offers before anything is typed: the buyer's recent
 * searches (they come back for the same SKUs), what is trending, and — when
 * there is neither — the header's categories with their stock chips.
 */
export function EmptySearchState({ onSelect, categories, inline = false }: Props) {
	const router = useRouter();
	const locale = useLocale();
	const t = useTranslations("browse");
	const { data: recents } = useRecentSearches();
	const clear = useClearRecentSearches();
	const { data: trending } = useTrendingSearches();

	const showCategories = !recents?.length && !trending?.length && !!categories?.length;
	if (!recents?.length && !trending?.length && !showCategories) return null;

	const search = (q: string) => {
		router.push(`/${locale}/search?q=${encodeURIComponent(q)}`);
		onSelect?.();
	};

	return (
		<div className={cn("grid gap-4 p-3", !inline && SEARCH_PANEL)}>
			{recents?.length ? (
				<section>
					<div className="mb-2 flex items-center justify-between">
						<h3 className="mill-label m-0 text-nl-russet">{t("recent")}</h3>
						<button
							type="button"
							className="h-8 rounded-sm px-1 text-[13px] text-nl-russet underline decoration-nl-cacao/20 underline-offset-4 hover:text-nl-cacao"
							onMouseDown={() => clear.mutate(undefined)}
						>
							{t("clearRecent")}
						</button>
					</div>
					<ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
						{recents.map((r) => (
							<li key={r.query} className="inline-flex items-center rounded-sm border border-nl-cacao/15 bg-nl-pearl">
								<button
									type="button"
									className="inline-flex h-9 items-center gap-2 ps-2.5 pe-1 text-[13.5px] text-nl-cacao hover:underline"
									onMouseDown={() => search(r.query)}
								>
									<Clock className="h-3.5 w-3.5 text-nl-russet" strokeWidth={1.75} aria-hidden="true" />
									{r.query}
								</button>
								<button
									type="button"
									aria-label={t("removeRecent", { query: r.query })}
									className="inline-flex h-9 w-8 items-center justify-center text-nl-russet hover:text-nl-cacao"
									onMouseDown={(e) => {
										e.stopPropagation();
										clear.mutate(r.query);
									}}
								>
									<X className="h-3.5 w-3.5" strokeWidth={2} />
								</button>
							</li>
						))}
					</ul>
				</section>
			) : null}
			{showCategories && categories ? (
				<section>
					<h3 className="mill-label m-0 mb-2 text-nl-russet">{t("browseCategories")}</h3>
					<ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
						{categories.map((c) => (
							<li key={c.href}>
								<button
									type="button"
									className={chip}
									onMouseDown={() => {
										router.push(c.href);
										onSelect?.();
									}}
								>
									{c.isCategory !== false && (
										<span
											aria-hidden="true"
											className="h-2.5 w-2.5 rounded-[2px]"
											style={{
												background: stockFor(
													c.href.split("/").filter(Boolean).pop() ?? c.label,
												).color,
											}}
										/>
									)}
									{c.label}
								</button>
							</li>
						))}
					</ul>
				</section>
			) : null}
			{trending?.length ? (
				<section>
					<h3 className="mill-label m-0 mb-2 text-nl-russet">{t("trending")}</h3>
					<ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
						{trending.map((item) => (
							<li key={item.query}>
								<button
									type="button"
									className={chip}
									onMouseDown={() => search(item.query)}
								>
									<TrendingUp className="h-3.5 w-3.5 text-nl-russet" strokeWidth={1.75} aria-hidden="true" />
									{item.query}
								</button>
							</li>
						))}
					</ul>
				</section>
			) : null}
		</div>
	);
}
