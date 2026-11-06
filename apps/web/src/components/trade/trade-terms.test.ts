import { describe, expect, it } from "vitest";
import {
	activeTier,
	breakRows,
	cardFromPrice,
	isValidQuantity,
	lowestUnitPrice,
	maxValidQuantity,
	nextTier,
	sampleOffer,
	snapUp,
	stepQuantity,
	tradeTermsFor,
	unitPriceFor,
} from "./trade-terms";

// Greyboard 2.0 mm, 70 × 100 cm, by the sheet: MOQ 50, steps of 25.
const product = {
	id: "p1",
	price: 600,
	variants: [
		{
			id: "v1",
			price: 600,
			unit_of_measure: "sheet",
			min_order_quantity: 50,
			order_increment: 25,
			price_tiers: [
				{ min_quantity: 500, unit_price: 480 },
				{ min_quantity: 100, unit_price: 540 },
			],
		},
		{
			id: "s1",
			price: 300,
			is_sample: true,
			is_active: true,
			sample_max_quantity: 3,
		},
	],
	inventoryRecords: [
		{ variant_id: "s1", quantity_on_hand: 10, quantity_reserved: 2 },
	],
};
const terms = tradeTermsFor(product, "v1");

describe("trade terms", () => {
	it("reads the variant's unit, rules and sorted tiers", () => {
		expect(terms).toMatchObject({
			unit: "sheet",
			minOrderQuantity: 50,
			orderIncrement: 25,
			basePrice: 600,
		});
		expect(terms.tiers.map((t) => t.min_quantity)).toEqual([100, 500]);
	});

	it("falls back to the product for a simple listing", () => {
		const t = tradeTermsFor({
			price: 900,
			unit_of_measure: "roll",
			price_tiers: [],
		});
		expect(t).toMatchObject({
			unit: "roll",
			minOrderQuantity: 1,
			orderIncrement: 1,
			basePrice: 900,
		});
	});

	it("prices by quantity like the server resolver", () => {
		expect(unitPriceFor(terms, 75)).toBe(600);
		expect(unitPriceFor(terms, 100)).toBe(540);
		expect(unitPriceFor(terms, 999)).toBe(480);
		expect(activeTier(terms, 75)).toBeNull();
		expect(activeTier(terms, 100)?.min_quantity).toBe(100);
		expect(nextTier(terms, 75)).toMatchObject({
			min_quantity: 100,
			unitsToGo: 25,
		});
		expect(nextTier(terms, 600)).toBeNull();
		expect(lowestUnitPrice(terms)).toBe(480);
	});

	it("keeps quantities on the minimum and its increments", () => {
		expect(isValidQuantity(terms, 75)).toBe(true);
		expect(isValidQuantity(terms, 60)).toBe(false);
		expect(snapUp(terms, 1)).toBe(50);
		expect(snapUp(terms, 60)).toBe(75);
		expect(stepQuantity(terms, 50, 1)).toBe(75);
		expect(stepQuantity(terms, 50, -1)).toBe(50);
		expect(stepQuantity(terms, 60, -1)).toBe(50);
		expect(stepQuantity(terms, 60, 1)).toBe(75);
		expect(stepQuantity(terms, 100, 1, 110)).toBe(100);
		expect(maxValidQuantity(terms, 110)).toBe(100);
		expect(maxValidQuantity(terms, 40)).toBeNull();
	});

	it("builds quantity-break rows from the minimum", () => {
		expect(breakRows(terms)).toEqual([
			{ from: 50, to: 99, unitPrice: 600, savingPct: 0 },
			{ from: 100, to: 499, unitPrice: 540, savingPct: 10 },
			{ from: 500, to: null, unitPrice: 480, savingPct: 20 },
		]);
		expect(breakRows(tradeTermsFor({ price: 100 }))).toEqual([]);
	});

	it("finds the sample with its cap and stock", () => {
		expect(sampleOffer(product)).toEqual({
			variantId: "s1",
			price: 300,
			maxQuantity: 3,
			available: 8,
		});
		expect(
			sampleOffer({
				variants: [{ id: "s", is_sample: true, is_active: false }],
			}),
		).toBeNull();
	});

	it("shows 'from' the lowest tier on cards", () => {
		expect(cardFromPrice({ price_min: 600, tier_price_min: 480 })).toEqual({
			amount: 480,
			fromTier: true,
		});
		expect(cardFromPrice({ price_min: 600 })).toEqual({
			amount: 600,
			fromTier: false,
		});
	});
});
