"use client";

import { FilterCheckRow, FilterGroupShell } from "@/components/product/filter-group-shell";
import type { FilterDraft } from "@/components/product/filter-state";
import { useTranslations } from "next-intl";
import { PLASTIC_BAN_PARAM } from "./eco-data";

/**
 * Listing filter: only products whose plastic-ban declaration MaterialHub
 * approved. Shown when the current results contain any, or while it is on so
 * the shopper can always turn it off.
 */
export function PlasticBanFilter({
	count,
	draft,
	setDraft,
}: {
	count?: number;
	draft: FilterDraft;
	setDraft: (next: FilterDraft) => void;
}) {
	const t = useTranslations("eco");
	const checked = draft[PLASTIC_BAN_PARAM] === "true";
	if (!checked && !count) return null;

	const toggle = () => {
		const next = { ...draft };
		if (checked) delete next[PLASTIC_BAN_PARAM];
		else next[PLASTIC_BAN_PARAM] = "true";
		setDraft(next);
	};

	return (
		<FilterGroupShell title={t("filterGroup")}>
			<FilterCheckRow
				label={t("filterLabel")}
				ariaLabel={t("filterLabel")}
				count={checked ? undefined : count}
				checked={checked}
				onChange={toggle}
			/>
			<p className="m-0 pt-1 text-[12.5px] leading-snug text-nl-russet">{t("filterHint")}</p>
		</FilterGroupShell>
	);
}
