"use client";

import { SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";

interface Props {
	activeCount: number;
	onOpen: () => void;
}

/**
 * Below `lg` the filter rail becomes a sheet; this is its trigger. A cut-card
 * button floating above the mobile tab bar (not a pill, despite the file name,
 * which is kept for import stability). The active-filter count is a cutter-orange
 * count badge.
 */
export function FilterTriggerPill({ activeCount, onOpen }: Props) {
	const t = useTranslations("browse");

	return (
		<button
			type="button"
			onClick={onOpen}
			aria-haspopup="dialog"
			aria-label={
				activeCount > 0
					? t("filterAndSortActive", { count: activeCount })
					: t("filterAndSort")
			}
			className="lg:hidden fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom))] left-1/2 z-30 inline-flex h-12 -translate-x-1/2 items-center gap-2.5 rounded-md bg-nl-cacao ps-4 pe-3.5 text-white shadow-lift transition-[transform,background-color] duration-150 hover:bg-nl-cacao/90 active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber"
		>
			<SlidersHorizontal className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
			<span className="text-[14px] font-medium">{t("filterAndSort")}</span>
			{activeCount > 0 && (
				<span
					data-testid="filter-pill-badge"
					aria-hidden="true"
					className="inline-flex h-5 min-w-5 items-center justify-center rounded-sm bg-nl-amber px-1 font-mono text-[11.5px] font-medium tabular-nums text-white"
				>
					{activeCount}
				</span>
			)}
		</button>
	);
}
