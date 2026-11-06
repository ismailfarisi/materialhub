import { describe, expect, it } from "vitest";
import {
	type TermsForm,
	aedToFils,
	buildTermsPayload,
	exampleQuantities,
	filsToAed,
	formFromView,
} from "./trade-pricing.helpers";

const form = (over: Partial<TermsForm> = {}): TermsForm => ({
	unit: "sheet",
	unitsPerPack: "",
	packContentsUnit: "",
	minOrderQuantity: "50",
	orderIncrement: "25",
	tiers: [],
	...over,
});

describe("money", () => {
	it("converts AED text to fils and back", () => {
		expect(aedToFils("4.80")).toBe(480);
		expect(aedToFils("12")).toBe(1200);
		expect(aedToFils("1,250.5")).toBe(125050);
		expect(aedToFils("4.805")).toBeNull();
		expect(aedToFils("abc")).toBeNull();
		expect(filsToAed(480)).toBe("4.80");
	});
});

describe("buildTermsPayload", () => {
	it("builds a sorted payload", () => {
		const { payload, errors } = buildTermsPayload(
			"v1",
			form({
				tiers: [
					{ minQuantity: "500", price: "4.80" },
					{ minQuantity: "100", price: "5.40" },
					{ minQuantity: "", price: "" },
				],
			}),
			600,
		);
		expect(errors).toEqual({});
		expect(payload).toEqual({
			variant_id: "v1",
			unit_of_measure: "sheet",
			units_per_pack: null,
			pack_contents_unit: null,
			min_order_quantity: 50,
			order_increment: 25,
			tiers: [
				{ min_quantity: 100, unit_price: 540 },
				{ min_quantity: 500, unit_price: 480 },
			],
		});
	});

	it("keeps pack contents only for pack-like units", () => {
		const { payload } = buildTermsPayload(
			null,
			form({ unit: "carton", unitsPerPack: "500", packContentsUnit: "sheet" }),
			12000,
		);
		expect(payload).toMatchObject({
			units_per_pack: 500,
			pack_contents_unit: "sheet",
		});
		const sheet = buildTermsPayload(
			null,
			form({ unitsPerPack: "500", packContentsUnit: "sheet" }),
			600,
		);
		expect(sheet.payload).toMatchObject({
			units_per_pack: null,
			pack_contents_unit: null,
		});
	});

	it("explains what is wrong", () => {
		expect(
			buildTermsPayload(null, form({ minOrderQuantity: "0" }), 600).errors
				.minOrderQuantity,
		).toBeTruthy();
		expect(
			buildTermsPayload(null, form({ unit: "pack", unitsPerPack: "10" }), 600)
				.errors.packContentsUnit,
		).toBeTruthy();
		const tiers = buildTermsPayload(
			null,
			form({
				tiers: [
					{ minQuantity: "40", price: "5.00" },
					{ minQuantity: "100", price: "6.50" },
				],
			}),
			600,
		).errors.tierRows;
		expect(tiers?.[0]).toMatch(/above the minimum/);
		const price = buildTermsPayload(
			null,
			form({
				tiers: [
					{ minQuantity: "100", price: "5.00" },
					{ minQuantity: "200", price: "5.50" },
				],
			}),
			600,
		).errors.tierRows;
		expect(price?.[1]).toMatch(/tier before/);
		const base = buildTermsPayload(
			null,
			form({ tiers: [{ minQuantity: "100", price: "6.00" }] }),
			600,
		);
		expect(base.errors.tierRows?.[0]).toMatch(/base price/);
	});

	it("round-trips a saved view", () => {
		const f = formFromView({
			variant_id: null,
			name: null,
			sku: null,
			price: 600,
			unit_of_measure: "roll",
			units_per_pack: null,
			pack_contents_unit: null,
			min_order_quantity: 2,
			order_increment: 1,
			tiers: [{ min_quantity: 10, unit_price: 550 }],
		});
		expect(f).toMatchObject({
			unit: "roll",
			minOrderQuantity: "2",
			tiers: [{ minQuantity: "10", price: "5.50" }],
		});
	});

	it("lists example quantities", () => {
		expect(exampleQuantities(50, 25)).toEqual([50, 75, 100, 125]);
	});
});
