"use client";

import { useResultCount } from "@/lib/queries/products";
import { Sheet, SheetContent } from "@materialhub/ui";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { FilterGroups } from "./filter-groups";
import type { FacetConfig, FilterDraft } from "./filter-state";
import { useFilterDraft } from "./use-filter-draft";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	config: FacetConfig;
}

const SORT_OPTIONS = [
	{ value: "relevance", labelKey: "relevance" },
	{ value: "price_asc", labelKey: "priceAsc" },
	{ value: "price_desc", labelKey: "priceDesc" },
	{ value: "newest", labelKey: "newest" },
	{ value: "rating", labelKey: "rating" },
] as const;

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

export function FilterSheet({ open, onOpenChange, config }: Props) {
	const t = useTranslations("category");
	const router = useRouter();
	const searchParams = useSearchParams();
	const initial = useMemo(() => paramsToDraft(searchParams), [searchParams]);

	const { draft, setDraft, reset } = useFilterDraft(initial);
	const debounced = useDebounced(draft, 250);
	// biome-ignore lint/suspicious/noExplicitAny: useResultCount params shape is a superset of FilterDraft
	const { data: countData } = useResultCount(debounced as any);
	const count = countData ?? 0;

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
			<SheetContent side="bottom" className="h-[100dvh] p-0 flex flex-col">
				{/* pe-12 reserves space for SheetContent's absolute close ✕ (end-4),
				    so the "Clear All" button doesn't render under it. Logical props keep it RTL-correct. */}
				<div className="flex items-center justify-between border-b ps-4 pe-12 py-1.5">
					<h2 className="text-base font-semibold">{t("filterAndSort")}</h2>
					<button
						type="button"
						onClick={reset}
						className="text-sm text-primary hover:underline min-h-[44px] px-2"
					>
						{t("clearAll")}
					</button>
				</div>

				<div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
					<div>
						<h3 className="text-sm font-medium mb-2">{t("sort")}</h3>
						<select
							value={draft.sort ?? "relevance"}
							onChange={(e) => setDraft({ ...draft, sort: e.target.value })}
							className="w-full border rounded px-2 py-2 text-sm"
						>
							{SORT_OPTIONS.map((s) => (
								<option key={s.value} value={s.value}>
									{t(s.labelKey)}
								</option>
							))}
						</select>
					</div>

					<FilterGroups
						config={config}
						draft={draft}
						setDraft={setDraft}
						layout="accordion"
					/>
				</div>

				<div
					className="border-t bg-background px-4 py-3"
					style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
				>
					<button
						type="button"
						onClick={commit}
						className="w-full rounded-full bg-warm-dark text-cream py-3 font-medium"
					>
						{t("showResults", { count })}
					</button>
				</div>
			</SheetContent>
		</Sheet>
	);
}
