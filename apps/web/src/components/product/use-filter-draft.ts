"use client";

import { useCallback, useMemo, useState } from "react";
import type { FilterDraft } from "./filter-state";

export function useFilterDraft(initial: FilterDraft) {
	const [draft, setDraft] = useState<FilterDraft>(initial);

	const reset = useCallback(() => setDraft(initial), [initial]);

	return useMemo(() => ({ draft, setDraft, reset }), [draft, reset]);
}
