/**
 * Pure helpers that turn the product-detail API payload into what the PDP
 * shows: the mill-label spec rows, the variant option axes, per-variant stock,
 * the unit of measure and the category path. Nothing here invents data: a row
 * or option exists only when the payload carries it.
 */
import type { Spec } from "@/components/swatch";

// biome-ignore lint/suspicious/noExplicitAny: untyped API response shape
type AnyRecord = Record<string, any>;

export interface PdpVariant {
	id: string;
	name: string;
	sku: string | null;
	options: Record<string, string>;
	price: number;
	compareAt: number | null;
	weightGrams: number | null;
	dimensionsCm: Record<string, unknown> | null;
	available: number;
}

export interface OptionValue {
	value: string;
	/** Real colour from the attribute value, when the catalogue has one. */
	hex: string | null;
	image: string | null;
}

export interface OptionAxis {
	key: string;
	label: string;
	values: OptionValue[];
}

export interface CategoryCrumb {
	id?: string;
	name: string;
	slug?: string;
}

const UNIT_KEYS = ["unit", "unit-of-measure", "unit_of_measure", "uom", "sold-by", "sold_by"];
/** Synthetic axis key for variants that carry no option values. */
export const VARIANT_AXIS = "__variant";

function toInt(v: unknown): number | null {
	if (v == null || v === "") return null;
	const n = typeof v === "string" ? Number.parseInt(v, 10) : Number(v);
	return Number.isFinite(n) ? n : null;
}

function humanise(key: string): string {
	const s = key.replace(/[-_]+/g, " ").trim();
	return s.charAt(0).toUpperCase() + s.slice(1);
}

function attrSlug(av: AnyRecord): string | undefined {
	return av?.attribute?.slug ?? undefined;
}

function attrDisplay(av: AnyRecord): string | null {
	const v = av?.attributeValue?.display_value ?? av?.attributeValue?.value ?? av?.text_value;
	return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Sum available stock per variant from the inventory records. */
export function variantStock(product: AnyRecord): Record<string, number> {
	const map: Record<string, number> = {};
	if (!Array.isArray(product.inventoryRecords)) return map;
	for (const inv of product.inventoryRecords) {
		if (!inv?.variant_id) continue;
		const direct = toInt(inv.quantity_available);
		const qty =
			direct ?? (toInt(inv.quantity_on_hand) ?? 0) - (toInt(inv.quantity_reserved) ?? 0);
		map[inv.variant_id] = (map[inv.variant_id] ?? 0) + Math.max(0, qty);
	}
	return map;
}

export function normaliseVariants(product: AnyRecord): PdpVariant[] {
	if (!Array.isArray(product.variants)) return [];
	const stock = variantStock(product);
	const untracked = product.track_inventory === false;
	return product.variants
		// A sample variant is ordered from its own action, not picked as an option.
		.filter((v: AnyRecord) => v?.id && v?.price != null && v?.is_active !== false && !v?.is_sample)
		.sort((a: AnyRecord, b: AnyRecord) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
		.map((v: AnyRecord) => {
			const options: Record<string, string> = {};
			for (const [k, val] of Object.entries(v.option_values ?? {})) {
				if (val != null && String(val).trim()) options[k] = String(val).trim();
			}
			return {
				id: v.id,
				name: v.name ?? "",
				sku: v.sku ?? null,
				options,
				price: toInt(v.price) ?? 0,
				compareAt: toInt(v.compare_at_price),
				weightGrams: toInt(v.weight_grams),
				dimensionsCm: v.dimensions_cm ?? null,
				available: untracked ? Number.POSITIVE_INFINITY : (stock[v.id] ?? 0),
			};
		});
}

/**
 * Option axes from the variants' option values. Axes where every variant has
 * the same value are left out (they belong in the spec table, not a picker).
 * Variants with no option values fall back to one axis keyed by variant name.
 */
export function buildOptionAxes(product: AnyRecord, variants: PdpVariant[], fallbackLabel: string): OptionAxis[] {
	if (variants.length === 0) return [];
	const keys: string[] = [];
	for (const v of variants) for (const k of Object.keys(v.options)) if (!keys.includes(k)) keys.push(k);

	if (keys.length === 0) {
		if (variants.length < 2) return [];
		return [
			{
				key: VARIANT_AXIS,
				label: fallbackLabel,
				values: variants.map((v) => ({ value: v.name || v.sku || v.id, hex: null, image: null })),
			},
		];
	}

	const avs: AnyRecord[] = Array.isArray(product.attributeValues) ? product.attributeValues : [];
	return keys
		.map((key) => {
			const values: string[] = [];
			for (const v of variants) {
				const val = v.options[key];
				if (val && !values.includes(val)) values.push(val);
			}
			const attr = avs.find((av) => attrSlug(av) === key)?.attribute;
			return {
				key,
				label: attr?.name ?? humanise(key),
				values: values.map((value) => {
					const match = avs.find(
						(av) =>
							attrSlug(av) === key &&
							(av.attributeValue?.value === value || av.attributeValue?.display_value === value),
					)?.attributeValue;
					return {
						value,
						hex: typeof match?.color_hex === "string" && match.color_hex ? match.color_hex : null,
						image: match?.swatch_image_url ?? null,
					};
				}),
			};
		})
		.filter((axis) => axis.values.length > 1);
}

/** The variant value an axis shows for a given variant. */
export function axisValue(axis: OptionAxis, v: PdpVariant): string | undefined {
	return axis.key === VARIANT_AXIS ? v.name || v.sku || v.id : v.options[axis.key];
}

/**
 * The variant a click on (axis, value) leads to: keep the other selections
 * when such a variant exists, otherwise take the first variant with the value.
 */
export function pickVariant(
	variants: PdpVariant[],
	axes: OptionAxis[],
	current: PdpVariant | undefined,
	axis: OptionAxis,
	value: string,
): PdpVariant | undefined {
	const withValue = variants.filter((v) => axisValue(axis, v) === value);
	if (!current) return withValue[0];
	const exact = withValue.find((v) =>
		axes.every((a) => a.key === axis.key || axisValue(a, v) === axisValue(a, current)),
	);
	return exact ?? withValue.find((v) => v.available > 0) ?? withValue[0];
}

/** Unit of measure, when the data carries one ("sheet", "roll", "pack"). */
export function resolveUnit(product: AnyRecord, variant?: PdpVariant): string | null {
	for (const k of UNIT_KEYS) {
		const v = variant?.options[k];
		if (v) return v.toLowerCase();
	}
	const attrs = product.attributes ?? {};
	for (const k of UNIT_KEYS) {
		const v = attrs[k];
		if (typeof v === "string" && v.trim()) return v.trim().toLowerCase();
	}
	const avs: AnyRecord[] = Array.isArray(product.attributeValues) ? product.attributeValues : [];
	const av = avs.find((a) => UNIT_KEYS.includes(attrSlug(a) ?? "") && !a.variant_id);
	const v = av ? attrDisplay(av) : null;
	return v ? v.toLowerCase() : null;
}

const nf = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });

export function formatWeight(grams: number | null | undefined): string | null {
	if (grams == null || grams <= 0) return null;
	return grams >= 1000 ? `${nf.format(grams / 1000)} kg` : `${nf.format(grams)} g`;
}

export function formatDimensions(dims: Record<string, unknown> | null | undefined): string | null {
	if (!dims || typeof dims !== "object") return null;
	const order = ["length", "width", "height", "depth", "thickness"];
	const parts = order
		.map((k) => Number(dims[k] ?? dims[k[0]]))
		.filter((n) => Number.isFinite(n) && n > 0);
	return parts.length ? `${parts.map((n) => nf.format(n)).join(" × ")} cm` : null;
}

export interface SpecLabels {
	dimensions: string;
	weight: string;
	origin: string;
	sku: string;
}

/**
 * Mill-label rows: the product's visible attribute values (variant-specific
 * rows override product rows for the same attribute), then the selected
 * variant's option values not already covered, then size, weight, origin, SKU.
 */
export function buildSpecs(product: AnyRecord, variant: PdpVariant | undefined, labels: SpecLabels): Spec[] {
	const avs: AnyRecord[] = Array.isArray(product.attributeValues) ? product.attributeValues : [];
	const rows = new Map<string, { label: string; values: string[]; order: number; variant: boolean }>();

	for (const av of avs) {
		if (av?.is_visible === false) continue;
		if (av.variant_id && av.variant_id !== variant?.id) continue;
		const slug = attrSlug(av) ?? av.attribute_id;
		const label = av.attribute?.name;
		const value = attrDisplay(av);
		if (!slug || !label || !value) continue;
		const isVariantRow = Boolean(av.variant_id);
		const existing = rows.get(slug);
		if (!existing || (isVariantRow && !existing.variant)) {
			rows.set(slug, { label, values: [value], order: av.attribute?.sort_order ?? 0, variant: isVariantRow });
		} else if (existing.variant === isVariantRow && !existing.values.includes(value)) {
			existing.values.push(value);
		}
	}

	const specs: Spec[] = [...rows.entries()]
		.sort((a, b) => a[1].order - b[1].order)
		.map(([, r]) => ({ label: r.label, value: r.values.join(", ") }));

	if (variant) {
		for (const [k, v] of Object.entries(variant.options)) {
			if (rows.has(k)) continue;
			const label =
				avs.find((av) => attrSlug(av) === k)?.attribute?.name ?? humanise(k);
			if (!specs.some((s) => s.label === label)) specs.push({ label, value: v });
		}
	}

	const dims = formatDimensions(variant?.dimensionsCm ?? product.dimensions_cm);
	if (dims) specs.push({ label: labels.dimensions, value: dims });
	const weight = formatWeight(variant?.weightGrams ?? toInt(product.weight_grams));
	if (weight) specs.push({ label: labels.weight, value: weight });
	if (product.country_of_origin) specs.push({ label: labels.origin, value: String(product.country_of_origin) });
	const sku = variant?.sku ?? product.sku;
	if (sku) specs.push({ label: labels.sku, value: String(sku) });

	// MillLabel keys rows by label; keep the first of any duplicate.
	const seen = new Set<string>();
	return specs.filter((s) => {
		if (seen.has(s.label)) return false;
		seen.add(s.label);
		return true;
	});
}

/** Primary category id of a product payload. */
export function primaryCategoryId(product: AnyRecord): string | null {
	const pcs: AnyRecord[] = Array.isArray(product.productCategories) ? product.productCategories : [];
	return product.category_id ?? pcs.find((p) => p.is_primary)?.category_id ?? pcs[0]?.category_id ?? null;
}

/** Root-to-leaf path of a category id in the category tree. */
export function findCategoryPath(tree: AnyRecord[] | null | undefined, id: string | null): CategoryCrumb[] {
	if (!id || !Array.isArray(tree)) return [];
	const walk = (nodes: AnyRecord[], trail: CategoryCrumb[]): CategoryCrumb[] | null => {
		for (const n of nodes) {
			const next = [...trail, { id: n.id, name: n.name, slug: n.slug }];
			if (n.id === id) return next;
			if (Array.isArray(n.children) && n.children.length) {
				const hit = walk(n.children, next);
				if (hit) return hit;
			}
		}
		return null;
	};
	return walk(tree, []) ?? [];
}

/** id → root category, for colouring related cards with their own stock. */
export function rootCategoryIndex(tree: AnyRecord[] | null | undefined): Record<string, string> {
	const out: Record<string, string> = {};
	if (!Array.isArray(tree)) return out;
	const walk = (nodes: AnyRecord[], root: string) => {
		for (const n of nodes) {
			out[n.id] = root;
			if (Array.isArray(n.children)) walk(n.children, root);
		}
	};
	for (const r of tree) {
		out[r.id] = r.name;
		if (Array.isArray(r.children)) walk(r.children, r.name);
	}
	return out;
}
