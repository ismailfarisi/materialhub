"use client";

import { ListingError } from "./listing-states";

/**
 * Body of a listing route's `error.tsx`: the page threw while rendering (not
 * merely an empty result). Retrying re-renders the segment.
 */
export function ListingRouteError({ reset }: { reset: () => void }) {
	return (
		<div className="mx-auto max-w-[1400px] px-4 py-8 md:px-8 md:py-12">
			<ListingError onRetry={reset} />
		</div>
	);
}
