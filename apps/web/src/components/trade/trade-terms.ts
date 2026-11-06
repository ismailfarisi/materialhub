/**
 * Trade pricing on the storefront: unit of measure, minimum order, order
 * increment, quantity-break tiers and samples, read from the product payload.
 *
 * The cart and checkout price lines on the server (order-service
 * `domain/cart/pricing/price-resolver.ts`). These helpers mirror that resolver
 * so the product page shows the price the cart will charge; the server stays
 * the authority.
 */

// biome-ignore lint/suspicious/noExplicitAny: untyped API response shape
type AnyRecord = Record<string, any>;

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
/** Platform default when a sample has no own cap (matches the server). */
export const DEFAULT_SAMPLE_MAX = 2;

export interface Tier {
	min_quantity: number;
	unit_price: number;
}

export interface TradeTerms {
	unit: Unit | null;
	unitsPerPack: number | null;
	packContentsUnit: Unit | null;
	minOrderQuantity: number;
	orderIncrement: number;
	basePrice: number;
	tiers: Tier[];
}

export interface SampleOffer {
	variantId: string;
	price: number;
	maxQuantity: number;
	available: number;
}

function isUnit(v: unknown): v is Unit {
	return typeof v === "string" && (UNITS as readonly string[]).includes(v);
}

function posInt(v: unknown, fallback: number): number {
	const n = Math.trunc(Number(v));
	return Number.isFinite(n) && n >= 1 ? n : fallback;
}

export function normaliseTiers(raw: unknown): Tier[] {
	if (!Array.isArray(raw)) return [];
	const byMin = new Map<number, Tier>();
	for (const t of raw as AnyRecord[]) {
		const min = Math.trunc(Number(t?.min_quantity));
		const price = Math.trunc(Number(t?.unit_price));
		if (
			Number.isFinite(min) &&
			Number.isFinite(price) &&
			min >= 2 &&
			price >= 0
		) {
			byMin.set(min, { min_quantity: min, unit_price: price });
		}
	}
	return [...byMin.values()].sort((a, b) => a.min_quantity - b.min_quantity);
}

/** Terms of the selected variant, or of the product when it has no variants. */
export function tradeTermsFor(
	product: AnyRecord,
	variantId?: string | null,
): TradeTerms {
	const variant = variantId
		? (product.variants as AnyRecord[] | undefined)?.find(
				(v) => v?.id === variantId,
			)
		: undefined;
	const src = variant ?? product;
	return {
		unit: isUnit(src.unit_of_measure) ? src.unit_of_measure : null,
		unitsPerPack:
			src.units_per_pack != null ? posInt(src.units_per_pack, 1) : null,
		packContentsUnit: isUnit(src.pack_contents_unit)
			? src.pack_contents_unit
			: null,
		minOrderQuantity: posInt(src.min_order_quantity, 1),
		orderIncrement: posInt(src.order_increment, 1),
		basePrice: Math.max(0, Math.trunc(Number(src.price) || 0)),
		tiers: normaliseTiers(src.price_tiers),
	};
}

/** Unit price at a quantity: the highest tier reached, never above base. */
export function unitPriceFor(terms: TradeTerms, quantity: number): number {
	let price = terms.basePrice;
	for (const t of terms.tiers)
		if (t.min_quantity <= quantity && t.unit_price < price)
			price = t.unit_price;
	return price;
}

/** The tier in force at a quantity (null = base price). */
export function activeTier(terms: TradeTerms, quantity: number): Tier | null {
	const price = unitPriceFor(terms, quantity);
	if (price >= terms.basePrice) return null;
	return (
		[...terms.tiers]
			.reverse()
			.find((t) => t.min_quantity <= quantity && t.unit_price === price) ?? null
	);
}

/** Next cheaper tier above a quantity, with how many units it takes to reach it. */
export function nextTier(
	terms: TradeTerms,
	quantity: number,
): (Tier & { unitsToGo: number }) | null {
	const now = unitPriceFor(terms, quantity);
	const t = terms.tiers.find(
		(x) => x.min_quantity > quantity && x.unit_price < now,
	);
	return t ? { ...t, unitsToGo: t.min_quantity - quantity } : null;
}

export function lowestUnitPrice(terms: TradeTerms): number {
	return terms.tiers.reduce(
		(m, t) => Math.min(m, t.unit_price),
		terms.basePrice,
	);
}

export function isValidQuantity(terms: TradeTerms, q: number): boolean {
	return (
		Number.isInteger(q) &&
		q >= terms.minOrderQuantity &&
		(q - terms.minOrderQuantity) % terms.orderIncrement === 0
	);
}

/** Smallest valid quantity at or above `q` (MOQ, then MOQ + k × increment). */
export function snapUp(terms: TradeTerms, q: number): number {
	const moq = terms.minOrderQuantity;
	const inc = terms.orderIncrement;
	if (!Number.isFinite(q) || q <= moq) return moq;
	return moq + Math.ceil((Math.trunc(q) - moq) / inc) * inc;
}

/** Largest valid quantity at or below `max`, or null when even the minimum exceeds it. */
export function maxValidQuantity(
	terms: TradeTerms,
	max: number,
): number | null {
	if (!Number.isFinite(max)) return Number.POSITIVE_INFINITY;
	if (max < terms.minOrderQuantity) return null;
	return (
		terms.minOrderQuantity +
		Math.floor((max - terms.minOrderQuantity) / terms.orderIncrement) *
			terms.orderIncrement
	);
}

/** One step up or down from `q` along the valid quantities, kept within [MOQ, max]. */
export function stepQuantity(
	terms: TradeTerms,
	q: number,
	dir: 1 | -1,
	max = Number.POSITIVE_INFINITY,
): number {
	const top = maxValidQuantity(terms, max) ?? terms.minOrderQuantity;
	const base = isValidQuantity(terms, q)
		? q
		: dir > 0
			? snapUp(terms, q) - terms.orderIncrement
			: snapUp(terms, q);
	const next = base + dir * terms.orderIncrement;
	return Math.min(top, Math.max(terms.minOrderQuantity, next));
}

export interface BreakRow {
	from: number;
	/** Last quantity of the band; null for the open-ended top band. */
	to: number | null;
	unitPrice: number;
	/** Percentage below base, rounded; 0 for the base row. */
	savingPct: number;
}

/** Rows of the quantity-break table: the base band from MOQ, then each tier. */
export function breakRows(terms: TradeTerms): BreakRow[] {
	const tiers = terms.tiers.filter(
		(t) =>
			t.min_quantity > terms.minOrderQuantity && t.unit_price < terms.basePrice,
	);
	if (tiers.length === 0) return [];
	const starts = [
		{ min_quantity: terms.minOrderQuantity, unit_price: terms.basePrice },
		...tiers,
	];
	return starts.map((t, i) => {
		const nextStart = starts[i + 1]?.min_quantity;
		return {
			from: t.min_quantity,
			to: nextStart != null ? nextStart - 1 : null,
			unitPrice: t.unit_price,
			savingPct:
				terms.basePrice > 0
					? Math.round((1 - t.unit_price / terms.basePrice) * 100)
					: 0,
		};
	});
}

/** The product's active sample, if it offers one. */
export function sampleOffer(product: AnyRecord): SampleOffer | null {
	const v = (product.variants as AnyRecord[] | undefined)?.find(
		(x) => x?.is_sample && x?.is_active !== false,
	);
	if (!v?.id) return null;
	let available = 0;
	for (const inv of (product.inventoryRecords as AnyRecord[] | undefined) ??
		[]) {
		if (inv?.variant_id !== v.id) continue;
		available += Math.max(
			0,
			Number(inv.quantity_on_hand ?? 0) - Number(inv.quantity_reserved ?? 0),
		);
	}
	if (product.track_inventory === false) available = Number.POSITIVE_INFINITY;
	return {
		variantId: v.id,
		price: Math.max(0, Math.trunc(Number(v.price) || 0)),
		maxQuantity: posInt(v.sample_max_quantity, DEFAULT_SAMPLE_MAX),
		available,
	};
}

/** Listing-card price: "from" the lowest tier when tiers beat the base price. */
export function cardFromPrice(doc: {
	price_min: number;
	tier_price_min?: number | null;
}): {
	amount: number;
	fromTier: boolean;
} {
	const tier = doc.tier_price_min;
	return typeof tier === "number" && tier > 0 && tier < doc.price_min
		? { amount: tier, fromTier: true }
		: { amount: doc.price_min, fromTier: false };
}

/**
 * Stock of a product without variants. The product-level total would also
 * count the sample's own stock, so sum only the rows with no variant.
 */
export function simpleProductAvailable(product: AnyRecord): number | null {
	if (product.track_inventory === false) return Number.POSITIVE_INFINITY;
	const rows = (product.inventoryRecords as AnyRecord[] | undefined) ?? [];
	if (!rows.some((r) => r?.variant_id)) return null; // no variant rows: the product total is right
	return rows
		.filter((r) => !r?.variant_id)
		.reduce(
			(sum, r) =>
				sum +
				Math.max(
					0,
					Number(r.quantity_on_hand ?? 0) - Number(r.quantity_reserved ?? 0),
				),
			0,
		);
}

export type TradeViolationCode =
	| "MIN_ORDER_QUANTITY"
	| "ORDER_INCREMENT"
	| "SAMPLE_QUANTITY_CAP";

/** The trade-rule code and details of a failed cart call, if that is why it failed. */
export function tradeErrorOf(err: unknown): {
	code: TradeViolationCode;
	suggested: number;
	minOrderQuantity: number;
	orderIncrement: number;
	maxQuantity: number | null;
} | null {
	const data = (err as { response?: { data?: AnyRecord } })?.response?.data;
	const code = data?.error;
	if (
		code !== "MIN_ORDER_QUANTITY" &&
		code !== "ORDER_INCREMENT" &&
		code !== "SAMPLE_QUANTITY_CAP"
	)
		return null;
	const d = (data?.details ?? {}) as AnyRecord;
	return {
		code,
		suggested: posInt(d.suggested_quantity, 1),
		minOrderQuantity: posInt(d.min_order_quantity, 1),
		orderIncrement: posInt(d.order_increment, 1),
		maxQuantity: d.max_quantity != null ? posInt(d.max_quantity, 1) : null,
	};
}
