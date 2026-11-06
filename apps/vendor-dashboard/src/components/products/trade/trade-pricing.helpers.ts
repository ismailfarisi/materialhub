/**
 * Pure helpers for the vendor Trade pricing tab. The server validates the same
 * rules (product-service trade-pricing.validation.ts); checking here lets the
 * form say what is wrong before saving.
 */

export const UNITS = [
	"sheet",
	"roll",
	"metre",
	"pack",
	"carton",
	"box",
	"piece",
	"kg",
] as const;
export type Unit = (typeof UNITS)[number];
export const PACK_UNITS: readonly Unit[] = ["pack", "carton", "box", "roll"];
export const MAX_TIERS = 10;
export const DEFAULT_SAMPLE_MAX = 2;

export interface TierRow {
	/** Text as typed, so a half-typed value doesn't jump. */
	minQuantity: string;
	/** AED as typed, e.g. "4.80". */
	price: string;
}

export interface TermsForm {
	unit: Unit | "";
	unitsPerPack: string;
	packContentsUnit: Unit | "";
	minOrderQuantity: string;
	orderIncrement: string;
	tiers: TierRow[];
}

export interface TermsView {
	variant_id: string | null;
	name: string | null;
	sku: string | null;
	price: number;
	unit_of_measure: Unit | null;
	units_per_pack: number | null;
	pack_contents_unit: Unit | null;
	min_order_quantity: number;
	order_increment: number;
	tiers: { min_quantity: number; unit_price: number }[];
}

/** "4.80" → 480 fils; null when it isn't a price. */
export function aedToFils(text: string): number | null {
	const t = text.trim().replace(/,/g, "");
	if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
	return Math.round(Number.parseFloat(t) * 100);
}

export function filsToAed(fils: number): string {
	return (fils / 100).toFixed(2);
}

function wholeAtLeast(text: string, min: number): number | null {
	const t = text.trim();
	if (!/^\d+$/.test(t)) return null;
	const n = Number.parseInt(t, 10);
	return n >= min ? n : null;
}

export function formFromView(v: TermsView): TermsForm {
	return {
		unit: v.unit_of_measure ?? "",
		unitsPerPack: v.units_per_pack != null ? String(v.units_per_pack) : "",
		packContentsUnit: v.pack_contents_unit ?? "",
		minOrderQuantity: String(v.min_order_quantity ?? 1),
		orderIncrement: String(v.order_increment ?? 1),
		tiers: (v.tiers ?? []).map((t) => ({
			minQuantity: String(t.min_quantity),
			price: filsToAed(t.unit_price),
		})),
	};
}

export interface TermsPayload {
	variant_id: string | null;
	unit_of_measure: Unit | null;
	units_per_pack: number | null;
	pack_contents_unit: Unit | null;
	min_order_quantity: number;
	order_increment: number;
	tiers: { min_quantity: number; unit_price: number }[];
}

export type FieldErrors = Partial<
	Record<
		| "unitsPerPack"
		| "packContentsUnit"
		| "minOrderQuantity"
		| "orderIncrement"
		| "tiers",
		string
	>
> & {
	tierRows?: Record<number, string>;
};

/**
 * Check the form against the base price and build the PUT body. Returns the
 * errors to show when something is off.
 */
export function buildTermsPayload(
	variantId: string | null,
	form: TermsForm,
	basePriceFils: number,
): { payload: TermsPayload | null; errors: FieldErrors } {
	const errors: FieldErrors = {};
	const moq = wholeAtLeast(form.minOrderQuantity, 1);
	if (moq == null) errors.minOrderQuantity = "Enter a whole number, 1 or more";
	const inc = wholeAtLeast(form.orderIncrement, 1);
	if (inc == null) errors.orderIncrement = "Enter a whole number, 1 or more";

	let perPack: number | null = null;
	const isPack = form.unit !== "" && PACK_UNITS.includes(form.unit);
	if (isPack && form.unitsPerPack.trim() !== "") {
		perPack = wholeAtLeast(form.unitsPerPack, 1);
		if (perPack == null)
			errors.unitsPerPack = "Enter a whole number, 1 or more";
		else if (form.packContentsUnit === "")
			errors.packContentsUnit = "Say what each one holds";
	}

	const rows = form.tiers.filter(
		(r) => r.minQuantity.trim() !== "" || r.price.trim() !== "",
	);
	if (rows.length > MAX_TIERS) errors.tiers = `Up to ${MAX_TIERS} tiers`;
	const parsed = rows.map((r) => ({
		min_quantity: wholeAtLeast(r.minQuantity, 2),
		unit_price: aedToFils(r.price),
	}));
	const tierRows: Record<number, string> = {};
	parsed.forEach((t, i) => {
		if (t.min_quantity == null)
			tierRows[i] = "Quantity must be a whole number, 2 or more";
		else if (t.unit_price == null) tierRows[i] = "Price must look like 4.80";
		else if (moq != null && t.min_quantity <= moq)
			tierRows[i] = `Start above the minimum order (${moq})`;
	});
	if (Object.keys(tierRows).length === 0) {
		const order = parsed
			.map((t, i) => ({ ...t, i }))
			.sort((a, b) => (a.min_quantity ?? 0) - (b.min_quantity ?? 0));
		let prevMin = 0;
		let prevPrice = basePriceFils;
		for (const t of order) {
			if (t.min_quantity === prevMin)
				tierRows[t.i] = "Two tiers start at the same quantity";
			else if ((t.unit_price ?? 0) >= prevPrice)
				tierRows[t.i] =
					prevPrice === basePriceFils && prevMin === 0
						? "Must be lower than the base price"
						: "Must be lower than the tier before it";
			prevMin = t.min_quantity ?? 0;
			prevPrice = t.unit_price ?? 0;
		}
	}
	if (Object.keys(tierRows).length) errors.tierRows = tierRows;

	if (Object.keys(errors).length > 0) return { payload: null, errors };
	return {
		payload: {
			variant_id: variantId,
			unit_of_measure: form.unit === "" ? null : form.unit,
			units_per_pack: perPack,
			pack_contents_unit:
				perPack == null || form.packContentsUnit === ""
					? null
					: form.packContentsUnit,
			min_order_quantity: moq as number,
			order_increment: inc as number,
			tiers: parsed
				.map((t) => ({
					min_quantity: t.min_quantity as number,
					unit_price: t.unit_price as number,
				}))
				.sort((a, b) => a.min_quantity - b.min_quantity),
		},
		errors,
	};
}

/** The first few quantities a buyer can order, e.g. "50, 75, 100 …". */
export function exampleQuantities(
	moq: number,
	increment: number,
	count = 4,
): number[] {
	return Array.from({ length: count }, (_, i) => moq + i * increment);
}
