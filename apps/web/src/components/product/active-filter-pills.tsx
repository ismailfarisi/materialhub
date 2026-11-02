"use client";

import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ActivePill } from "./filter-state";

interface Props {
	pills: ActivePill[];
	onRemove: (pill: { group: string; value: string }) => void;
	onClearAll: () => void;
}

/** Fields the chip names itself; anything else is an attribute name from the API. */
const KNOWN_FIELDS = new Set(["brand", "vendor", "price", "rating", "availability"]);

/**
 * Active filters as removable chips above the grid. Chips are cut at 2px
 * (`rounded-sm`), field name in pencil, value in ink — mono for measured values.
 */
export function ActiveFilterPills({ pills, onRemove, onClearAll }: Props) {
	const t = useTranslations("browse");

	if (pills.length === 0) return null;

	return (
		<div
			className="flex flex-wrap items-center gap-2 pb-3"
			data-testid="active-filter-pills"
		>
			<span className="sr-only">{t("activeFilters")}</span>
			{pills.map((p) => {
				const field = p.field
					? KNOWN_FIELDS.has(p.field)
						? t(`field.${p.field}`)
						: p.field
					: null;
				return (
					<button
						key={`${p.group}:${p.value}`}
						type="button"
						aria-label={t("removeFilter", { label: p.label })}
						onClick={() => onRemove({ group: p.group, value: p.value })}
						className="group inline-flex h-8 max-w-full items-center gap-1.5 rounded-sm border border-nl-cacao/20 bg-nl-pearl ps-2.5 pe-1.5 text-[13px] text-nl-cacao transition-colors hover:border-nl-cacao/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber"
					>
						{field && p.display ? (
							<span className="flex min-w-0 items-baseline gap-1.5">
								<span className="shrink-0 text-nl-russet">{field}</span>
								<span
									className={cn(
										"truncate",
										p.mono && "font-mono text-[12.5px] tabular-nums",
									)}
								>
									{p.display}
								</span>
							</span>
						) : (
							<span className="truncate">
								{p.field === "availability" ? t("includingOutOfStock") : p.label}
							</span>
						)}
						<X
							className="h-3.5 w-3.5 shrink-0 text-nl-russet transition-colors group-hover:text-nl-cacao"
							strokeWidth={2}
							aria-hidden="true"
						/>
					</button>
				);
			})}
			<button
				type="button"
				onClick={onClearAll}
				className="h-8 rounded-sm px-1.5 text-[13px] font-medium text-nl-russet underline decoration-nl-cacao/20 underline-offset-4 hover:text-nl-cacao hover:decoration-nl-cacao focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber"
			>
				{t("clearAll")}
			</button>
		</div>
	);
}
