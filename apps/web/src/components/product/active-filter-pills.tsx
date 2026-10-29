"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ActivePill } from "./filter-state";

interface Props {
	pills: ActivePill[];
	onRemove: (pill: { group: string; value: string }) => void;
	onClearAll: () => void;
}

export function ActiveFilterPills({ pills, onRemove, onClearAll }: Props) {
	const t = useTranslations("category");

	if (pills.length === 0) return null;

	return (
		<div
			className="flex flex-wrap items-center gap-2 py-2"
			data-testid="active-filter-pills"
		>
			{pills.map((p) => (
				<button
					key={`${p.group}:${p.value}`}
					type="button"
					aria-label={`Remove ${p.label}`}
					onClick={() => onRemove({ group: p.group, value: p.value })}
					className="inline-flex items-center gap-2 bg-nl-cacao px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-nl-linen transition-colors hover:bg-nl-espresso"
				>
					<span>{p.label}</span>
					<X className="h-3 w-3 opacity-70" strokeWidth={1.5} />
				</button>
			))}
			<button
				type="button"
				onClick={onClearAll}
				className="ms-1 self-center border-b border-nl-cacao/20 pb-0.5 text-[10px] uppercase tracking-[0.22em] text-nl-russet hover:text-nl-cacao"
			>
				{t("clearAll")}
			</button>
		</div>
	);
}
