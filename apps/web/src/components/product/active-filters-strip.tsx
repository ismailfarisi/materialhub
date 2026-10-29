"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ActiveFilterPills } from "./active-filter-pills";
import { type FacetConfig, computeActiveFilters } from "./filter-state";

export function ActiveFiltersStrip({ config }: { config: FacetConfig }) {
	const router = useRouter();
	const params = useSearchParams();

	const { pills } = computeActiveFilters(config, params);
	if (pills.length === 0) return null;

	function removeOne(p: { group: string; value: string }) {
		const next = new URLSearchParams(params.toString());
		if (
			["minPrice", "maxPrice", "minRating", "includeOutOfStock"].includes(
				p.group,
			)
		) {
			next.delete(p.group);
		} else if (p.group === "price") {
			next.delete("minPrice");
			next.delete("maxPrice");
		} else {
			const list = next.get(p.group)?.split(",").filter(Boolean) ?? [];
			const updated = list.filter((v) => v !== p.value);
			if (updated.length === 0) next.delete(p.group);
			else next.set(p.group, updated.join(","));
		}
		next.delete("page");
		router.replace(`?${next.toString()}`, { scroll: false });
	}

	return (
		<ActiveFilterPills
			pills={pills}
			onRemove={removeOne}
			onClearAll={() => router.replace("?", { scroll: false })}
		/>
	);
}
