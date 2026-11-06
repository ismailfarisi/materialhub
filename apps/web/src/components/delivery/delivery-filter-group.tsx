"use client";

import {
	FilterCheckRow,
	FilterGroupShell,
} from "@/components/product/filter-group-shell";
import type { FilterDraft } from "@/components/product/filter-state";
import { UAE_EMIRATES } from "@/lib/emirates";
import { useTranslations } from "next-intl";
import { canonicalEmirate, useDeliveryEmirate } from "./use-delivery-emirate";

type Speed = "same_day" | "next_day";

/** Pure draft update: picking a speed also pins the emirate it was judged for. */
export function toggleDeliverySpeed(
	draft: FilterDraft,
	speed: Speed,
	emirate: string,
): FilterDraft {
	const { delivery, emirate: _emirate, ...rest } = draft;
	return delivery === speed ? rest : { ...rest, delivery: speed, emirate };
}

/**
 * Same-day / next-day filter for listings. product-service resolves it from
 * each supplier's warehouse settings (`?delivery=same_day&emirate=Dubai`).
 */
export function DeliveryFilterGroup({
	draft,
	setDraft,
}: {
	draft: FilterDraft;
	setDraft: (next: FilterDraft) => void;
}) {
	const t = useTranslations("delivery");
	const tEmirates = useTranslations("emirates");
	const { emirate: preferred } = useDeliveryEmirate();
	const emirate = canonicalEmirate(draft.emirate) ?? preferred;
	const labelKey = UAE_EMIRATES.find((e) => e.value === emirate)?.labelKey;
	const name = labelKey ? tEmirates(labelKey) : emirate;

	return (
		<FilterGroupShell title={t("filterTitle")}>
			<FilterCheckRow
				label={t("filterSameDay", { emirate: name })}
				checked={draft.delivery === "same_day"}
				onChange={() =>
					setDraft(toggleDeliverySpeed(draft, "same_day", emirate))
				}
			/>
			<FilterCheckRow
				label={t("filterNextDay", { emirate: name })}
				checked={draft.delivery === "next_day"}
				onChange={() =>
					setDraft(toggleDeliverySpeed(draft, "next_day", emirate))
				}
			/>
			<p className="m-0 pt-1 text-[12.5px] leading-snug text-nl-russet">
				{t("filterHint")}
			</p>
		</FilterGroupShell>
	);
}
