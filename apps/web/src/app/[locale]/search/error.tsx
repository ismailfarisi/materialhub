"use client";

import { ListingRouteError } from "@/components/product/listing-route-error";

export default function ErrorBoundary({ reset }: { error: Error; reset: () => void }) {
	return <ListingRouteError reset={reset} />;
}
