"use client";

import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { clearedHref } from "./active-filters-strip";
import { FilterGroups } from "./filter-groups";
import type { FacetConfig, FilterDraft } from "./filter-state";

function readDraft(searchParams: URLSearchParams): FilterDraft {
	const out: FilterDraft = {};
	for (const [k, v] of searchParams.entries()) {
		if (k === "page") continue;
		out[k] = v;
	}
	return out;
}

export function FilterSidebar({ config }: { config: FacetConfig }) {
	const t = useTranslations("browse");
	const router = useRouter();
	const searchParams = useSearchParams();
	const [isPending, startTransition] = useTransition();

	// Local draft drives the checkbox UI so toggles render instantly. Without
	// this, ProductCard checkbox state is derived from URL params and stays
	// stale until the RSC round-trip completes (~hundreds of ms on stage).
	const [draft, setDraft] = useState<FilterDraft>(() =>
		readDraft(searchParams),
	);

	// Re-sync from URL when an external navigation lands (back/forward, link
	// click). Skipping while a transition is pending preserves any clicks the
	// user has made since kicking off the current navigation.
	useEffect(() => {
		if (isPending) return;
		setDraft(readDraft(searchParams));
	}, [searchParams, isPending]);

	const commit = useCallback(
		(next: FilterDraft) => {
			setDraft(next);
			const params = new URLSearchParams();
			for (const [k, v] of Object.entries(next)) {
				if (v) params.set(k, v);
			}
			params.delete("page");
			startTransition(() => {
				router.replace(`?${params.toString()}`, { scroll: false });
			});
		},
		[router],
	);

	const clearAll = useCallback(() => {
		const href = clearedHref(searchParams);
		setDraft(readDraft(new URLSearchParams(href.slice(1))));
		startTransition(() => {
			router.replace(href, { scroll: false });
		});
	}, [router, searchParams]);

	const hasFilters = Object.keys(draft).some(
		(k) => !["sort", "q", "view"].includes(k),
	);

	return (
		<aside
			className="scrollbar-nl hidden shrink-0 pb-16 pe-2 lg:sticky lg:top-[8.75rem] lg:block lg:max-h-[calc(100vh-9.75rem)] lg:w-[264px] lg:overflow-y-auto"
			aria-label={t("filters")}
			aria-busy={isPending || undefined}
			data-pending={isPending ? "true" : undefined}
		>
			<div className="flex h-10 items-center justify-between gap-3">
				<h2 className="m-0 font-display text-[17px] font-semibold tracking-[-0.01em] text-nl-cacao">
					{t("filters")}
				</h2>
				{hasFilters && (
					<button
						type="button"
						onClick={clearAll}
						className="h-8 rounded-sm px-1 text-[13px] font-medium text-nl-russet underline decoration-nl-cacao/20 underline-offset-4 transition-colors hover:text-nl-cacao hover:decoration-nl-cacao focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber"
					>
						{t("clearAll")}
					</button>
				)}
			</div>

			<div
				className={
					isPending
						? "opacity-70 transition-opacity duration-150"
						: "transition-opacity duration-150"
				}
			>
				<FilterGroups
					config={config}
					draft={draft}
					setDraft={commit}
					layout="vertical"
				/>
			</div>
		</aside>
	);
}
