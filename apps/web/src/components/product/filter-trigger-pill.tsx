"use client";

import { SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";

interface Props {
	activeCount: number;
	onOpen: () => void;
}

export function FilterTriggerPill({ activeCount, onOpen }: Props) {
	const t = useTranslations("category");

	return (
		<button
			type="button"
			onClick={onOpen}
			aria-haspopup="dialog"
			aria-label={t("filterAndSort")}
			className="lg:hidden fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full bg-warm-dark text-cream px-5 py-3 shadow-lg shadow-warm-dark/30 active:scale-95 transition-transform"
		>
			<SlidersHorizontal className="h-4 w-4" />
			<span className="text-sm font-medium">{t("filterAndSort")}</span>
			{activeCount > 0 && (
				<span
					data-testid="filter-pill-badge"
					className="ms-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-copper text-warm-dark text-xs font-semibold px-1.5"
				>
					{activeCount}
				</span>
			)}
		</button>
	);
}
