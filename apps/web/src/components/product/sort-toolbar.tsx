"use client";

import { ChevronDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useId } from "react";

export const SORT_OPTIONS = [
	{ value: "relevance", labelKey: "relevance" },
	{ value: "price_asc", labelKey: "priceAsc" },
	{ value: "price_desc", labelKey: "priceDesc" },
	{ value: "newest", labelKey: "newest" },
	{ value: "rating", labelKey: "rating" },
] as const;

/**
 * Result count and sort, above the grid. The count is a fact, set in mono; the
 * sort is a native select styled as a Swatch Book field. Sort lives in the
 * filter sheet below `lg`, so only the count shows on small screens.
 */
export function SortToolbar({ totalResults }: { totalResults: number }) {
	const t = useTranslations("browse");
	const tCat = useTranslations("category");
	const locale = useLocale();
	const router = useRouter();
	const searchParams = useSearchParams();
	const currentSort = searchParams.get("sort") || "relevance";
	const selectId = useId();

	function setParam(key: string, value: string) {
		const params = new URLSearchParams(searchParams.toString());
		params.set(key, value);
		params.delete("page");
		router.replace(`?${params.toString()}`, { scroll: false });
	}

	const formatted = new Intl.NumberFormat(locale === "ar" ? "ar-AE" : "en-AE").format(
		totalResults,
	);

	return (
		<div className="flex min-h-14 flex-wrap items-center justify-between gap-3 pb-3">
			<p className="m-0 flex items-baseline gap-1.5 text-[14px] text-nl-russet" aria-live="polite">
				<span className="font-mono text-[15px] font-medium tabular-nums text-nl-cacao">
					{formatted}
				</span>
				<span>{t("resultsLabel", { count: totalResults })}</span>
			</p>

			<div data-testid="sort-controls" className="hidden items-center gap-2.5 lg:flex">
				<label htmlFor={selectId} className="text-[13px] font-medium text-nl-russet">
					{tCat("sort")}
				</label>
				<div className="relative">
					<select
						id={selectId}
						value={currentSort}
						onChange={(e) => setParam("sort", e.target.value)}
						className="h-10 cursor-pointer appearance-none rounded-md border border-nl-cacao/15 bg-nl-pearl ps-3 pe-9 text-[14px] text-nl-cacao outline-none transition-colors hover:border-nl-cacao/35 focus-visible:border-nl-cacao focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber"
					>
						{SORT_OPTIONS.map((s) => (
							<option key={s.value} value={s.value}>
								{tCat(s.labelKey)}
							</option>
						))}
					</select>
					<ChevronDown
						className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-nl-russet"
						strokeWidth={1.75}
						aria-hidden="true"
					/>
				</div>
			</div>
		</div>
	);
}
