/**
 * Category stocks — the seven material colours of the Swatch Book system.
 * Every top-level category owns one. Use `stockFor()` to resolve a category
 * slug or name (from a product, breadcrumb or nav tab) to its stock.
 */
export type StockKey =
	| "paper"
	| "leather"
	| "hardware"
	| "finishing"
	| "packaging"
	| "trims"
	| "craft";

export interface Stock {
	key: StockKey;
	/** Top-level category slug from the seed tree. */
	slug: string;
	/** Short material name shown on swatches. */
	material: string;
	/** CSS colour, ready for style props. */
	color: string;
}

export const STOCKS: Record<StockKey, Stock> = {
	paper: { key: "paper", slug: "papers-boards", material: "Paper blue", color: "hsl(var(--stock-paper))" },
	leather: { key: "leather", slug: "leather-fabrics", material: "Oxblood", color: "hsl(var(--stock-leather))" },
	hardware: { key: "hardware", slug: "hardware-fittings", material: "Brass", color: "hsl(var(--stock-hardware))" },
	finishing: { key: "finishing", slug: "adhesives-finishing", material: "Laminate green", color: "hsl(var(--stock-finishing))" },
	packaging: { key: "packaging", slug: "boxes-packaging", material: "Kraft", color: "hsl(var(--stock-packaging))" },
	trims: { key: "trims", slug: "ribbons-trims", material: "Grosgrain red", color: "hsl(var(--stock-trims))" },
	craft: { key: "craft", slug: "decoration-craft", material: "Tissue violet", color: "hsl(var(--stock-craft))" },
};

export const STOCK_ORDER: StockKey[] = [
	"paper",
	"leather",
	"hardware",
	"finishing",
	"packaging",
	"trims",
	"craft",
];

const KEYWORDS: Array<[StockKey, RegExp]> = [
	["paper", /paper|board|card ?stock|greyboard|art ?paper/i],
	["leather", /leather|fabric|cloth|linen|textile|velvet/i],
	["hardware", /hardware|fitting|hinge|magnet|clasp|rivet|handle/i],
	["finishing", /adhesive|glue|finish|foil|laminat|tape/i],
	["packaging", /box|packag|carton|corrugat|mailer|bag/i],
	["trims", /ribbon|trim|cord|lace|tassel/i],
	["craft", /craft|decor|party|stationer|kit|swatch/i],
];

/** Resolve a category slug or display name to its stock. Defaults to paper. */
export function stockFor(slugOrName?: string | null): Stock {
	if (!slugOrName) return STOCKS.paper;
	const exact = STOCK_ORDER.find((k) => STOCKS[k].slug === slugOrName);
	if (exact) return STOCKS[exact];
	const hit = KEYWORDS.find(([, re]) => re.test(slugOrName));
	return STOCKS[hit ? hit[0] : "paper"];
}
