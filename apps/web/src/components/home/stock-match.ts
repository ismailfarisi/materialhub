import { type Stock, type StockKey, stockFor } from "@/components/swatch";

/**
 * `stockFor()` falls back to paper blue when nothing matches, which is right
 * for a product (every product has a category) but wrong for a vendor or brand
 * we know nothing about: painting them paper blue would claim a category they
 * may not sell. This resolves a stock only on a real match and otherwise
 * returns `null`, so the caller can use the neutral binder-ink tab instead.
 */
const PAPER_HINT = /paper|board|card ?stock|greyboard/i;

export function matchStock(
	...candidates: Array<string | null | undefined>
): Stock | null {
	for (const raw of candidates) {
		const text = raw?.trim();
		if (!text) continue;
		const hit = stockFor(text);
		if (hit.key !== "paper" || hit.slug === text || PAPER_HINT.test(text))
			return hit;
	}
	return null;
}

/**
 * Tab for a card with no known category: binder ink, shaped like a stock so it
 * drops into `SwatchCard`. Ink is a neutral, not a category colour, so this
 * keeps the "no stock without a category" rule.
 */
export const NEUTRAL_STOCK: Stock = {
	key: "paper" as StockKey,
	slug: "",
	material: "Binder ink",
	color: "hsl(var(--nl-cacao))",
};

/** Neutral tab for cards sitting on a binder-black band, where ink would vanish. */
export const NEUTRAL_STOCK_ON_DARK: Stock = {
	...NEUTRAL_STOCK,
	material: "Pencil",
	color: "hsl(var(--nl-russet))",
};
