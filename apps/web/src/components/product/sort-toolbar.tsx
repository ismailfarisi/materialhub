"use client";

import { ChevronDown, Grid3X3, List } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";

export function SortToolbar({ totalResults }: { totalResults: number }) {
	const t = useTranslations("category");
	const router = useRouter();
	const searchParams = useSearchParams();
	const currentSort = searchParams.get("sort") || "relevance";
	const view = searchParams.get("view") || "grid";

	function setParam(key: string, value: string) {
		const params = new URLSearchParams(searchParams.toString());
		params.set(key, value);
		params.delete("page");
		router.replace(`?${params.toString()}`, { scroll: false });
	}

	const sortLabelKey =
		currentSort === "price_asc"
			? "priceAsc"
			: currentSort === "price_desc"
				? "priceDesc"
				: currentSort === "newest"
					? "newest"
					: currentSort === "rating"
						? "rating"
						: "relevance";

	return (
		<div className="flex flex-wrap items-center justify-between gap-3 border-b border-nl-cacao/10 py-3">
			<div className="flex items-baseline gap-2">
				<span className="font-serif text-[22px] leading-none text-nl-cacao">
					{totalResults.toLocaleString()}
				</span>
				<span className="text-[10px] uppercase tracking-[0.22em] text-nl-russet">
					{t("results", { count: totalResults })
						.replace(String(totalResults), "")
						.replace(/,/g, "")
						.trim() || "results"}
				</span>
			</div>

			<div
				data-testid="sort-controls"
				className="hidden lg:flex items-center gap-4"
			>
				<div className="flex items-center gap-2">
					<span className="text-[10px] uppercase tracking-[0.22em] text-nl-russet">
						{t("sort")}
					</span>
					<label className="group relative inline-flex cursor-pointer items-center gap-2 border border-nl-cacao/20 px-3 py-2 transition-colors hover:border-nl-cacao/40">
						<select
							aria-label={t("sort")}
							value={currentSort}
							onChange={(e) => setParam("sort", e.target.value)}
							className="font-serif text-[14px] italic text-nl-cacao bg-transparent outline-none appearance-none pe-5 cursor-pointer"
						>
							<option value="relevance">{t("relevance")}</option>
							<option value="price_asc">{t("priceAsc")}</option>
							<option value="price_desc">{t("priceDesc")}</option>
							<option value="newest">{t("newest")}</option>
							<option value="rating">{t("rating")}</option>
						</select>
						<ChevronDown
							className="pointer-events-none absolute end-2 h-3.5 w-3.5 text-nl-cacao"
							strokeWidth={1.25}
							aria-hidden="true"
						/>
						<span className="sr-only">{t(sortLabelKey)}</span>
					</label>
				</div>

				<span className="h-5 w-px bg-nl-cacao/15" />

				<div className="flex">
					<button
						type="button"
						aria-label="Grid view"
						aria-pressed={view === "grid"}
						onClick={() => setParam("view", "grid")}
						className={`flex h-9 w-9 items-center justify-center border transition-colors ${
							view === "grid"
								? "border-nl-cacao bg-nl-cacao text-nl-linen"
								: "border-nl-cacao/20 bg-transparent text-nl-cacao hover:border-nl-cacao/40"
						}`}
					>
						<Grid3X3 className="h-4 w-4" strokeWidth={1.25} />
					</button>
					<button
						type="button"
						aria-label="List view"
						aria-pressed={view === "list"}
						onClick={() => setParam("view", "list")}
						className={`-ms-px flex h-9 w-9 items-center justify-center border transition-colors ${
							view === "list"
								? "border-nl-cacao bg-nl-cacao text-nl-linen"
								: "border-nl-cacao/20 bg-transparent text-nl-cacao hover:border-nl-cacao/40"
						}`}
					>
						<List className="h-4 w-4" strokeWidth={1.25} />
					</button>
				</div>
			</div>
		</div>
	);
}
