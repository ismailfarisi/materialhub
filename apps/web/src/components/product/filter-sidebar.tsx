"use client";

import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
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
	const t = useTranslations("category");
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
		setDraft({});
		startTransition(() => {
			router.replace("?", { scroll: false });
		});
	}, [router]);

	return (
		<aside
			className="scrollbar-nl hidden w-full shrink-0 pb-20 pe-1 lg:sticky lg:top-24 lg:block lg:max-h-[calc(100vh-6rem)] lg:w-64 lg:overflow-y-auto"
			aria-label={t("filters")}
			data-pending={isPending ? "true" : undefined}
		>
			<div className="flex items-baseline justify-between pt-1 pb-1">
				<span className="font-serif text-2xl text-nl-cacao">Refine</span>
				<button
					type="button"
					onClick={clearAll}
					className="text-[10px] uppercase tracking-[0.22em] text-nl-russet hover:text-nl-cacao"
				>
					{t("clearAll")}
				</button>
			</div>

			<FilterGroups
				config={config}
				draft={draft}
				setDraft={commit}
				layout="vertical"
			/>
		</aside>
	);
}
