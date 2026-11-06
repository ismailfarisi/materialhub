/**
 * Eco catalogue (plastic-ban ready packaging): pure helpers shared by the
 * badge, the product-page compliance block and the listing filter.
 *
 * The attribute and value slugs mirror the seed in
 * `backend/libs/database/src/eco/eco-catalogue.ts`. The storefront translates
 * the slugs it knows and falls back to the API's own label for anything else,
 * so a vendor-added value still shows.
 */

// biome-ignore lint/suspicious/noExplicitAny: untyped API response shape
type AnyRecord = Record<string, any>;

/** URL + API param for the "plastic-ban ready" filter. */
export const PLASTIC_BAN_PARAM = "plastic_ban_ready";

/** The rule collection the CMS can feature as the landing. */
export const PLASTIC_BAN_COLLECTION_SLUG = "plastic-ban-ready-packaging";

/** Single-use bags under this thickness are covered by the UAE ban. */
export const PLASTIC_BAN_BAG_MIN_MICRONS = 50;

/** Display order of the compliance rows, and which value slugs have copy. */
export const ECO_ATTRIBUTES: Record<string, readonly string[]> = {
	"material-composition": [
		"virgin-paper-fibre",
		"recycled-paper-fibre",
		"kraft-paper",
		"paperboard",
		"moulded-fibre-bagasse",
		"moulded-fibre-wood-pulp",
		"wood",
		"bamboo",
		"water-based-coating",
		"pla-lining",
		"pe-lining",
	],
	recyclable: ["yes", "no"],
	compostable: ["home", "industrial", "not-compostable"],
	"plastic-free": ["yes", "no"],
	"forest-certification": ["fsc", "pefc", "not-certified"],
	"bag-thickness-microns": [],
};

export const BAG_THICKNESS_SLUG = "bag-thickness-microns";

export function isEcoAttributeSlug(slug: string | undefined | null): boolean {
	return !!slug && Object.hasOwn(ECO_ATTRIBUTES, slug);
}

/**
 * The product with its compliance attributes taken out, so the generic spec
 * table does not repeat what the compliance block shows.
 */
export function withoutEcoAttributes<T extends AnyRecord>(product: T): T {
	if (!Array.isArray(product?.attributeValues)) return product;
	return {
		...product,
		attributeValues: product.attributeValues.filter(
			(av: AnyRecord) => !isEcoAttributeSlug(av?.attribute?.slug),
		),
	};
}

export interface EcoRow {
	/** Attribute slug, e.g. `recyclable`. */
	key: string;
	/** Raw values: a value slug (translatable) or free text, with its API label. */
	values: Array<{ slug: string | null; label: string }>;
}

/** Product-level compliance attribute rows in display order. */
export function ecoRows(product: AnyRecord): EcoRow[] {
	const avs: AnyRecord[] = Array.isArray(product?.attributeValues) ? product.attributeValues : [];
	const rows = new Map<string, EcoRow>();
	for (const av of avs) {
		const key = av?.attribute?.slug;
		if (!isEcoAttributeSlug(key) || av.variant_id || av.is_visible === false) continue;
		const label =
			av.attributeValue?.display_value ?? av.attributeValue?.value ?? av.text_value ?? null;
		if (label == null || String(label).trim() === "") continue;
		const row: EcoRow = rows.get(key) ?? { key, values: [] };
		const slug = av.attributeValue?.slug ?? null;
		if (!row.values.some((v) => v.label === String(label))) {
			row.values.push({ slug, label: String(label).trim() });
		}
		rows.set(key, row);
	}
	return Object.keys(ECO_ATTRIBUTES)
		.map((k) => rows.get(k))
		.filter((r): r is EcoRow => !!r);
}

/** Bag thickness in microns, when the product carries it. */
export function bagThicknessMicrons(product: AnyRecord): number | null {
	const row = ecoRows(product).find((r) => r.key === BAG_THICKNESS_SLUG);
	const n = row ? Number(row.values[0]?.label) : Number.NaN;
	return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * True only when MaterialHub approved the supplier's declaration. Listing
 * documents carry `plastic_ban_ready`; the product detail payload carries the
 * public `ecoDeclaration` summary (approved declarations only).
 */
export function isPlasticBanReady(product: AnyRecord | null | undefined): boolean {
	if (!product) return false;
	if (product.plastic_ban_ready === true) return true;
	return product.ecoDeclaration?.status === "approved";
}

/** Count of plastic-ban ready results from the search facets, if any. */
export function plasticBanFacetCount(facets: AnyRecord | null | undefined): number {
	const bucket = facets?.plastic_ban_ready;
	if (!Array.isArray(bucket)) return 0;
	const hit = bucket.find((b: AnyRecord) => String(b?.value) === "true");
	return Number(hit?.count) || 0;
}

/** Translation key for a value, or null when the storefront has no copy for it. */
export function ecoValueKey(attr: string, slug: string | null): string | null {
	if (!slug) return null;
	return ECO_ATTRIBUTES[attr]?.includes(slug) ? `values.${attr}.${slug}` : null;
}
