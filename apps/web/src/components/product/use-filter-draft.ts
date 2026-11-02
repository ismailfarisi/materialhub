"use client";

import { useCallback, useMemo, useState } from "react";
import type { FilterDraft } from "./filter-state";

/**
 * Local, uncommitted filter state for the mobile sheet. `reset` returns to what
 * the URL held when the sheet opened; `clear` empties every filter (the sheet's
 * "Clear all"). Neither commits — the sheet's "Show results" does that.
 */
export function useFilterDraft(initial: FilterDraft) {
	const [draft, setDraft] = useState<FilterDraft>(initial);

	const reset = useCallback(() => setDraft(initial), [initial]);
	const clear = useCallback(
		() =>
			// Sort is not a filter: keep it when clearing.
			setDraft((d): FilterDraft => (d.sort ? { sort: d.sort } : {})),
		[],
	);

	return useMemo(
		() => ({ draft, setDraft, reset, clear }),
		[draft, reset, clear],
	);
}
