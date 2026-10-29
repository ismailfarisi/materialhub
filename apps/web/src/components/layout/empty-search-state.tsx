"use client";

import {
	useClearRecentSearches,
	useRecentSearches,
} from "@/lib/queries/recent-searches";
import { useTrendingSearches } from "@/lib/queries/search";
import { X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

interface Props {
	onSelect?: () => void;
	/** Fallback browse chips (e.g. header nav categories) shown when there are no recents/trending. */
	categories?: Array<{ label: string; href: string }>;
}

export function EmptySearchState({ onSelect, categories }: Props) {
	const router = useRouter();
	const locale = useLocale();
	const t = useTranslations("common");
	const { data: recents } = useRecentSearches();
	const clear = useClearRecentSearches();
	const { data: trending } = useTrendingSearches();

	const showCategories = !recents?.length && !trending?.length && !!categories?.length;
	if (!recents?.length && !trending?.length && !showCategories) return null;

	return (
		<div className="bg-background border border-border/60 rounded-2xl shadow-xl shadow-black/5 overflow-hidden p-3">
			{recents?.length ? (
				<>
					<div className="flex items-center justify-between mb-2">
						<p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
							Recent
						</p>
						<button
							type="button"
							className="text-[10px] uppercase tracking-wider text-muted-foreground/70 hover:text-foreground"
							onMouseDown={() => clear.mutate(undefined)}
						>
							Clear all
						</button>
					</div>
					<div className="flex flex-wrap gap-2">
						{recents.map((r) => (
							<div
								key={r.query}
								className="flex items-center gap-1 text-xs px-3 py-1 rounded-full border border-border/60"
							>
								<button
									type="button"
									className="hover:underline"
									onMouseDown={() => {
										router.push(
											`/${locale}/search?q=${encodeURIComponent(r.query)}`,
										);
										onSelect?.();
									}}
								>
									{r.query}
								</button>
								<button
									type="button"
									aria-label={`Remove ${r.query}`}
									className="text-muted-foreground/60 hover:text-foreground"
									onMouseDown={(e) => {
										e.stopPropagation();
										clear.mutate(r.query);
									}}
								>
									<X className="h-3 w-3" />
								</button>
							</div>
						))}
					</div>
				</>
			) : null}
			{showCategories && categories ? (
				<section>
					<p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-2">
						{t("browse")}
					</p>
					<div className="flex flex-wrap gap-2">
						{categories.map((c) => (
							<button
								key={c.href}
								type="button"
								className="text-xs px-3 py-2 rounded-full border border-border/60 hover:bg-muted/60"
								onMouseDown={() => {
									router.push(c.href);
									onSelect?.();
								}}
							>
								{c.label}
							</button>
						))}
					</div>
				</section>
			) : null}
			{trending?.length ? (
				<section className="mt-3">
					<p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-2">
						Trending
					</p>
					<div className="flex flex-wrap gap-2">
						{trending.map((t) => (
							<button
								key={t.query}
								type="button"
								className="text-xs px-3 py-1 rounded-full border border-border/60 hover:bg-muted/60"
								onMouseDown={() => {
									router.push(
										`/${locale}/search?q=${encodeURIComponent(t.query)}`,
									);
									onSelect?.();
								}}
							>
								{t.query}
							</button>
						))}
					</div>
				</section>
			) : null}
		</div>
	);
}
