import { describe, expect, it } from "vitest";
import {
	type CartLineItem,
	cartPieceCount,
	cartSubtotalFils,
	groupBySupplier,
	isLineUnavailable,
	lineSpecs,
} from "./cart-lines";

const line = (over: Partial<CartLineItem>): CartLineItem => ({
	variant_id: "v1",
	product_title: "Kraft paper",
	image_url: "/x.png",
	current_price: 480,
	quantity: 1,
	...over,
});

describe("cart lines", () => {
	it("prints variant option values as specs, skipping empty and nested values", () => {
		const specs = lineSpecs(
			line({ options: { gsm: "120", sheet_size: "70×100 cm", finish: "", meta: { a: 1 } } }),
		);
		expect(specs).toEqual([
			{ label: "GSM", value: "120 gsm" },
			{ label: "Sheet size", value: "70×100 cm" },
		]);
	});

	it("falls back to the variant name when there are no options", () => {
		expect(lineSpecs(line({ variant_label: "Pack of 50" }))).toEqual([{ label: "Variant", value: "Pack of 50" }]);
		expect(lineSpecs(line({}))).toEqual([]);
	});

	it("groups lines by supplier in first-seen order with subtotals", () => {
		const groups = groupBySupplier([
			line({ variant_id: "a", vendor_id: "s1", vendor_name: "Gulf Board Co", quantity: 2 }),
			line({ variant_id: "b", vendor_id: "s2", vendor_name: "Leather Works", current_price: 1_000 }),
			line({ variant_id: "c", vendor_id: "s1", vendor_name: "Gulf Board Co" }),
		]);
		expect(groups.map((g) => [g.vendorName, g.items.length, g.subtotalFils])).toEqual([
			["Gulf Board Co", 2, 1_440],
			["Leather Works", 1, 1_000],
		]);
	});

	it("sums subtotal in fils and counts pieces", () => {
		const items = [line({ quantity: 3 }), line({ variant_id: "b", current_price: 1_250, quantity: 2 })];
		expect(cartSubtotalFils(items)).toBe(3 * 480 + 2 * 1_250);
		expect(cartPieceCount(items)).toBe(5);
	});

	it("flags lines whose listing is no longer published", () => {
		expect(isLineUnavailable(line({ product_status: "archived" }))).toBe(true);
		expect(isLineUnavailable(line({ product_status: "published" }))).toBe(false);
		expect(isLineUnavailable(line({}))).toBe(false);
	});
});
