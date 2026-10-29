"use client";

import { useState } from "react";
import { FilterSheet } from "./filter-sheet";
import type { FacetConfig } from "./filter-state";
import { FilterTriggerPill } from "./filter-trigger-pill";

export function MobileFilterControls({
	config,
	activeCount,
}: {
	config: FacetConfig;
	activeCount: number;
}) {
	const [open, setOpen] = useState(false);
	return (
		<>
			<FilterTriggerPill
				activeCount={activeCount}
				onOpen={() => setOpen(true)}
			/>
			<FilterSheet open={open} onOpenChange={setOpen} config={config} />
		</>
	);
}
