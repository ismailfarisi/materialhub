"use client";

import { Button } from "@/components/swatch";
import { useResultCount } from "@/lib/queries/products";
import { cn } from "@/lib/utils";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@materialhub/ui";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { FilterGroups } from "./filter-groups";
import type { FacetConfig, FilterDraft } from "./filter-state";
import { SORT_OPTIONS } from "./sort-toolbar";
import { useFilterDraft } from "./use-filter-draft";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	config: FacetConfig;
}

function paramsToDraft(params: URLSearchParams): FilterDraft {
	const out: FilterDraft = {};
	for (const [k, v] of params.entries()) {
		if (k === "page") continue;
		out[k] = v;
	}
	return out;
}

function useDebounced<T>(value: T, ms: number): T {
	const [v, setV] = useState(value);
	useEffect(() => {
		const id = setTimeout(() => setV(value), ms);
		return () => clearTimeout(id);
	}, [value, ms]);
	return v;
}

/**
 * Filters below `lg`: a bottom sheet holding sort and the same groups as the
 * desktop rail. Changes stay local until "Show N results", which commits them
 * to the URL in one navigation; the count previews the result as you go.
 */
export function FilterSheet({ open, onOpenChange, config }: Props) {
	const t = useTranslations("browse");
	const tCat = useTranslations("category");
	const router = useRouter();
	const searchParams = useSearchParams();
	const initial = useMemo(() => paramsToDraft(searchParams), [searchParams]);

	const { draft, setDraft, clear } = useFilterDraft(initial);
	const debounced = useDebounced(draft, 250);
	// biome-ignore lint/suspicious/noExplicitAny: useResultCount params shape is a superset of FilterDraft
	const { data: countData, isFetching } = useResultCount(debounced as any);
	const currentSort = draft.sort ?? "relevance";

	function commit() {
		const params = new URLSearchParams();
		for (const [k, v] of Object.entries(draft)) {
			if (v) params.set(k, v);
		}
		params.delete("page");
		router.replace(`?${params.toString()}`, { scroll: false });
		onOpenChange(false);
	}

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="bottom"
				className="flex h-[min(92dvh,100%)] flex-col gap-0 rounded-t-lg border-0 bg-nl-linen p-0 shadow-lift [&>button.absolute]:hidden"
			>
				<div className="flex items-center justify-between gap-3 border-b border-nl-cacao/12 bg-nl-linen px-4 py-2">
					<SheetTitle className="m-0 font-display text-[17px] font-semibold tracking-[-0.01em] text-nl-cacao">
						{t("filterAndSort")}
					</SheetTitle>
					<div className="flex items-center gap-1">
						<button
							type="button"
							onClick={clear}
							className="h-11 rounded-sm px-2 text-[14px] font-medium text-nl-russet underline decoration-nl-cacao/20 underline-offset-4 hover:text-nl-cacao focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber"
						>
							{t("clearAll")}
						</button>
						<SheetClose
							aria-label={t("close")}
							className="inline-flex h-11 w-11 items-center justify-center rounded-md text-nl-cacao hover:bg-nl-cacao/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber"
						>
							<X className="h-5 w-5" strokeWidth={1.75} />
						</SheetClose>
					</div>
				</div>

				<div className="scrollbar-nl flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-6">
					<fieldset className="m-0 mb-3 border-0 p-0">
						<legend className="mill-label mb-2 p-0 text-nl-russet">
							{tCat("sort")}
						</legend>
						<div className="flex flex-wrap gap-2">
							{SORT_OPTIONS.map((s) => {
								const active = currentSort === s.value;
								return (
									<label
										key={s.value}
										className={cn(
											"inline-flex h-10 cursor-pointer items-center rounded-sm border px-3 text-[13.5px] transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-nl-amber",
											active
												? "border-nl-cacao bg-nl-cacao text-white"
												: "border-nl-cacao/20 bg-nl-pearl text-nl-cacao hover:border-nl-cacao/50",
										)}
									>
										<input
											type="radio"
											name="sheet-sort"
											value={s.value}
											checked={active}
											onChange={() => setDraft({ ...draft, sort: s.value })}
											className="sr-only"
										/>
										{tCat(s.labelKey)}
									</label>
								);
							})}
						</div>
					</fieldset>

					<FilterGroups
						config={config}
						draft={draft}
						setDraft={setDraft}
						layout="accordion"
					/>
				</div>

				<div
					className="border-t border-nl-cacao/12 bg-nl-pearl px-4 pt-3"
					style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
				>
					<Button
						type="button"
						size="lg"
						onClick={commit}
						aria-busy={isFetching || undefined}
						className="w-full tabular-nums"
					>
						{countData == null
							? t("showResultsNoCount")
							: t("showResults", { count: countData })}
					</Button>
				</div>
			</SheetContent>
		</Sheet>
	);
}
