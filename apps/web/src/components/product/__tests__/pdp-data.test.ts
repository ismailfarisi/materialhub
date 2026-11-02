import { describe, expect, it } from "vitest";
import {
	buildOptionAxes,
	buildSpecs,
	findCategoryPath,
	formatDimensions,
	formatWeight,
	normaliseVariants,
	pickVariant,
	primaryCategoryId,
	resolveUnit,
	rootCategoryIndex,
} from "../pdp-data";

const labels = { dimensions: "Size", weight: "Weight", origin: "Origin", sku: "SKU" };

const product = {
	sku: "PU-ROLL",
	country_of_origin: "China",
	weight_grams: 450,
	attributeValues: [
		{ attribute: { slug: "thickness", name: "Thickness", sort_order: 2 }, attributeValue: { value: "0.9 mm" }, variant_id: null },
		{ attribute: { slug: "backing", name: "Backing", sort_order: 1 }, text_value: "Knitted fabric", variant_id: null },
		{ attribute: { slug: "colour", name: "Colour", sort_order: 3 }, attributeValue: { value: "Oxblood", color_hex: "#7A1F2E" }, variant_id: "v1" },
		{ attribute: { slug: "colour", name: "Colour", sort_order: 3 }, attributeValue: { value: "Black", color_hex: "#111" }, variant_id: "v2" },
	],
	variants: [
		{ id: "v1", price: "3800", sku: "PU-OX", option_values: { colour: "Oxblood", width: "137 cm" }, dimensions_cm: { length: 100, width: 137 } },
		{ id: "v2", price: 3800, sku: "PU-BK", option_values: { colour: "Black", width: "137 cm" } },
		{ id: "v3", price: 2100, sku: "PU-BK-S", option_values: { colour: "Black", width: "70 cm" }, is_active: false },
	],
	inventoryRecords: [
		{ variant_id: "v1", quantity_available: 2 },
		{ variant_id: "v1", quantity_on_hand: 5, quantity_reserved: 1 },
		{ variant_id: "v2", quantity_available: 0 },
	],
};

describe("pdp-data", () => {
	it("normalises active variants with summed stock", () => {
		const vs = normaliseVariants(product);
		expect(vs.map((v) => v.id)).toEqual(["v1", "v2"]);
		expect(vs[0].available).toBe(6);
		expect(vs[0].price).toBe(3800);
		expect(vs[1].available).toBe(0);
	});

	it("builds axes only where variants differ, with real colour hex", () => {
		const vs = normaliseVariants(product);
		const axes = buildOptionAxes(product, vs, "Option");
		expect(axes).toHaveLength(1);
		expect(axes[0].label).toBe("Colour");
		expect(axes[0].values).toEqual([
			{ value: "Oxblood", hex: "#7A1F2E", image: null },
			{ value: "Black", hex: "#111", image: null },
		]);
	});

	it("falls back to a variant-name axis when variants carry no options", () => {
		const p = { variants: [{ id: "a", name: "Pack of 10", price: 100 }, { id: "b", name: "Pack of 50", price: 400 }] };
		const vs = normaliseVariants(p);
		const axes = buildOptionAxes(p, vs, "Option");
		expect(axes[0].label).toBe("Option");
		expect(pickVariant(vs, axes, vs[0], axes[0], "Pack of 50")?.id).toBe("b");
	});

	it("builds the mill label from visible attributes, the variant and the product record", () => {
		const v1 = normaliseVariants(product)[0];
		expect(buildSpecs(product, v1, labels)).toEqual([
			{ label: "Backing", value: "Knitted fabric" },
			{ label: "Thickness", value: "0.9 mm" },
			{ label: "Colour", value: "Oxblood" },
			{ label: "Width", value: "137 cm" },
			{ label: "Size", value: "100 × 137 cm" },
			{ label: "Weight", value: "450 g" },
			{ label: "Origin", value: "China" },
			{ label: "SKU", value: "PU-OX" },
		]);
	});

	it("reads the unit of measure only from real data", () => {
		expect(resolveUnit({ attributes: { unit: "Roll" } })).toBe("roll");
		expect(resolveUnit({})).toBeNull();
		expect(
			resolveUnit({ attributeValues: [{ attribute: { slug: "unit-of-measure" }, attributeValue: { value: "Sheet" } }] }),
		).toBe("sheet");
	});

	it("formats weights and dimensions", () => {
		expect(formatWeight(1250)).toBe("1.25 kg");
		expect(formatWeight(null)).toBeNull();
		expect(formatDimensions({ length: 70, width: 100 })).toBe("70 × 100 cm");
		expect(formatDimensions({})).toBeNull();
	});

	it("resolves the category path and root index from the tree", () => {
		const tree = [
			{ id: "r1", name: "Papers & Boards", slug: "papers-boards", children: [{ id: "c1", name: "Greyboard & Chipboard", slug: "greyboard-chipboard", children: [] }] },
			{ id: "r2", name: "Leather & Fabrics", slug: "leather-fabrics", children: [] },
		];
		expect(primaryCategoryId({ productCategories: [{ category_id: "x" }, { category_id: "c1", is_primary: true }] })).toBe("c1");
		expect(findCategoryPath(tree, "c1").map((c) => c.slug)).toEqual(["papers-boards", "greyboard-chipboard"]);
		expect(findCategoryPath(tree, "missing")).toEqual([]);
		expect(rootCategoryIndex(tree)).toEqual({ r1: "Papers & Boards", c1: "Papers & Boards", r2: "Leather & Fabrics" });
	});
});
