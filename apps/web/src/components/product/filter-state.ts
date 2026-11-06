import type { AttributeFilter } from "@materialhub/ui";

export type FilterDraft = Record<string, string>;

export interface FacetConfig {
	brands: { value: string; label: string; count?: number }[];
	vendors: { value: string; label: string }[];
	/** Reuses the @materialhub/ui AttributeFilter shape (key, name, values…) */
	attributes: AttributeFilter[];
	priceRange: { min: number; max: number };
	/** Eco catalogue: results with an approved plastic-ban declaration. */
	plasticBanReady?: number;
}

export interface ActivePill {
	group: string;
	value: string;
	/** Plain-English "Field: value" — used for the remove button's accessible name. */
	label: string;
	/**
	 * Field the chip belongs to. Known fields (`brand`, `vendor`, `price`,
	 * `rating`, `availability`) are translated by the chip; anything else is an
	 * attribute name and shown as-is.
	 */
	field?: string;
	/** The value part on its own, for the chip body. */
	display?: string;
	/** Measured value (spec attribute or price): render it in mono. */
	mono?: boolean;
}

/**
 * Spec attributes are the numbers and finishes a trade buyer filters on first:
 * grammage, thickness, sheet or roll size, width, length, finish. They are
 * matched on the attribute key or name because attributes are vendor-defined
 * rather than seeded, and they render first in the rail with mono values.
 */
const SPEC_RE =
	/gsm|grammage|g\/m|weight|thick|caliper|calliper|size|width|length|dimension|format|finish|coating|texture|grain|flute|ply|core|غرام|سماكة|مقاس|عرض|طول|تشطيب/i;

export function isSpecAttribute(attr: { key: string; name: string }): boolean {
	return SPEC_RE.test(attr.key) || SPEC_RE.test(attr.name);
}

const NON_FILTER_PARAMS = new Set(["sort", "view", "page", "q"]);

function brandLabel(value: string, facets: FacetConfig): string {
	return facets.brands.find((b) => b.value === value)?.label ?? value;
}

function vendorLabel(value: string, facets: FacetConfig): string {
	return facets.vendors.find((v) => v.value === value)?.label ?? value;
}

function attributePill(
	attrKey: string,
	value: string,
	facets: FacetConfig,
): ActivePill {
	const attr = facets.attributes.find((a) => a.key === attrKey);
	const name = attr?.name ?? attrKey;
	// Range attributes carry "min-max" rather than a value slug.
	const display =
		attr?.filter_input_type === "range"
			? value.replace("-", " – ")
			: (attr?.values?.find((v) => v.value === value)?.label ?? value);
	return {
		group: attrKey,
		value,
		label: `${name}: ${display}`,
		field: name,
		display,
		mono: attr ? isSpecAttribute(attr) : false,
	};
}

export function computeActiveFilters(
	facets: FacetConfig,
	params: URLSearchParams,
): { pills: ActivePill[]; count: number } {
	const pills: ActivePill[] = [];

	const brand = params.get("brand");
	if (brand) {
		for (const v of brand.split(",").filter(Boolean)) {
			const display = brandLabel(v, facets);
			pills.push({
				group: "brand",
				value: v,
				label: `Brand: ${display}`,
				field: "brand",
				display,
			});
		}
	}

	const vendor = params.get("vendor");
	if (vendor) {
		for (const v of vendor.split(",").filter(Boolean)) {
			const display = vendorLabel(v, facets);
			pills.push({
				group: "vendor",
				value: v,
				label: `Supplier: ${display}`,
				field: "vendor",
				display,
			});
		}
	}

	const minPrice = params.get("minPrice");
	const maxPrice = params.get("maxPrice");
	if (minPrice || maxPrice) {
		const display =
			minPrice && maxPrice
				? `${minPrice} – ${maxPrice}`
				: minPrice
					? `≥ ${minPrice}`
					: `≤ ${maxPrice}`;
		pills.push({
			group: "price",
			value: "range",
			label: `Price: AED ${display}`,
			field: "price",
			display: `AED ${display}`,
			mono: true,
		});
	}

	const minRating = params.get("minRating");
	if (minRating) {
		pills.push({
			group: "minRating",
			value: minRating,
			label: `${minRating}+ stars`,
			field: "rating",
			display: `${minRating}+`,
			mono: true,
		});
	}

	if (params.get("includeOutOfStock") === "true") {
		pills.push({
			group: "includeOutOfStock",
			value: "true",
			label: "Including out of stock",
			field: "availability",
		});
	}

	// Eco catalogue: the chip label is translated by ActiveFilterPills.
	if (params.get("plastic_ban_ready") === "true") {
		pills.push({ group: "plastic_ban_ready", value: "true", label: "Plastic-ban ready" });
	}

	for (const [key, raw] of params.entries()) {
		if (NON_FILTER_PARAMS.has(key) || key === "plastic_ban_ready") continue;
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
				// attributePill and render an "inStock: true" pill.
				"inStock",
			].includes(key)
		)
			continue;
		for (const v of raw.split(",").filter(Boolean)) {
			pills.push(attributePill(key, v, facets));
		}
	}

	return { pills, count: pills.length };
}
