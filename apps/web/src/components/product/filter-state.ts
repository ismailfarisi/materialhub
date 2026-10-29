import type { AttributeFilter } from "@materialhub/ui";

export type FilterDraft = Record<string, string>;

export interface FacetConfig {
	brands: { value: string; label: string; count?: number }[];
	vendors: { value: string; label: string }[];
	/** Reuses the @materialhub/ui AttributeFilter shape (key, name, values…) */
	attributes: AttributeFilter[];
	priceRange: { min: number; max: number };
}

export interface ActivePill {
	group: string;
	value: string;
	label: string;
}

const NON_FILTER_PARAMS = new Set(["sort", "view", "page", "q"]);

function labelForBrand(value: string, facets: FacetConfig): string {
	const match = facets.brands.find((b) => b.value === value);
	return `Brand: ${match?.label ?? value}`;
}

function labelForVendor(value: string, facets: FacetConfig): string {
	const match = facets.vendors.find((v) => v.value === value);
	return `Vendor: ${match?.label ?? value}`;
}

function labelForAttribute(
	attrKey: string,
	value: string,
	facets: FacetConfig,
): string {
	const attr = facets.attributes.find((a) => a.key === attrKey);
	const valueLabel =
		attr?.values?.find((v) => v.value === value)?.label ?? value;
	return `${attr?.name ?? attrKey}: ${valueLabel}`;
}

export function computeActiveFilters(
	facets: FacetConfig,
	params: URLSearchParams,
): { pills: ActivePill[]; count: number } {
	const pills: ActivePill[] = [];

	const brand = params.get("brand");
	if (brand) {
		for (const v of brand.split(",").filter(Boolean)) {
			pills.push({ group: "brand", value: v, label: labelForBrand(v, facets) });
		}
	}

	const vendor = params.get("vendor");
	if (vendor) {
		for (const v of vendor.split(",").filter(Boolean)) {
			pills.push({
				group: "vendor",
				value: v,
				label: labelForVendor(v, facets),
			});
		}
	}

	const minPrice = params.get("minPrice");
	const maxPrice = params.get("maxPrice");
	if (minPrice || maxPrice) {
		const min = minPrice ?? "0";
		const max = maxPrice ?? "∞";
		pills.push({
			group: "price",
			value: "range",
			label: `Price: ${min} – ${max}`,
		});
	}

	const minRating = params.get("minRating");
	if (minRating) {
		pills.push({
			group: "minRating",
			value: minRating,
			label: `${minRating}+ stars`,
		});
	}

	if (params.get("includeOutOfStock") === "true") {
		pills.push({
			group: "includeOutOfStock",
			value: "true",
			label: "Including out of stock",
		});
	}

	for (const [key, raw] of params.entries()) {
		if (NON_FILTER_PARAMS.has(key)) continue;
		if (
			[
				"brand",
				"vendor",
				"minPrice",
				"maxPrice",
				"minRating",
				"includeOutOfStock",
				// Legacy param, superseded by includeOutOfStock. Bookmarked and
				// shared listing URLs still carry it; applyStockDefault strips it
				// before the API call, so it must not fall through to
				// labelForAttribute and render an "inStock: true" pill.
				"inStock",
			].includes(key)
		)
			continue;
		for (const v of raw.split(",").filter(Boolean)) {
			pills.push({
				group: key,
				value: v,
				label: labelForAttribute(key, v, facets),
			});
		}
	}

	return { pills, count: pills.length };
}
