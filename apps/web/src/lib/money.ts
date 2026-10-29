export function filsToAed(fils: number): string {
	return (fils / 100).toFixed(2);
}

export function formatAed(fils: number): string {
	return `${filsToAed(fils)} AED`;
}

/**
 * Localised currency string for prose — "AED 45" in English, "٤٥ د.إ." in
 * Arabic. Used by the category SEO copy and FAQ, where a price is embedded in a
 * sentence and has to read naturally in the page's own language and direction.
 *
 * Fractional fils are dropped: catalogue prices in prose read better as round
 * dirhams, and the exact amount is always on the product card next to it.
 */
export function formatAedForLocale(fils: number, locale: string): string {
	return new Intl.NumberFormat(locale, {
		style: "currency",
		currency: "AED",
		maximumFractionDigits: 0,
	}).format(fils / 100);
}

/**
 * Inverse of {@link filsToAed}: convert a whole-AED price-filter input (the
 * storefront's "Price (AED)" fields and the `minPrice`/`maxPrice` URL params
 * hold AED, e.g. "20") into fils — the unit the product-service stores and
 * filters prices on. Returns undefined for blank/invalid/negative input so
 * callers can drop the query param entirely instead of sending a bad value.
 */
export function aedToFils(
	value: string | number | null | undefined,
): number | undefined {
	if (value == null || value === "") return undefined;
	const aed = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(aed) || aed < 0) return undefined;
	return Math.round(aed * 100);
}
