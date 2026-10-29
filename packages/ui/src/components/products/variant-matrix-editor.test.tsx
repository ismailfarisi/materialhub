import { describe, expect, it } from "vitest";
import {
	type CategoryAttributeLink,
	splitCategoryAttributes,
} from "./product-attributes-editor";
import {
	type VariantMatrixValue,
	buildVariantRowsPayload,
	existingVariantKeys,
	minVariantPriceFils,
	rowsMissingPrice,
	slugifyAxisName,
	variantCombinations,
} from "./variant-matrix-editor";

const sizeAxis = {
	key: "attr-size",
	attribute_id: "attr-size",
	name: "Size",
	values: [
		{ id: "v-s", value: "s", label: "Small" },
		{ id: "v-m", value: "m", label: "Medium" },
	],
};

const colorAxis = {
	key: "attr-color",
	attribute_id: "attr-color",
	name: "Color",
	values: [{ id: "v-red", value: "red", label: "Red" }],
};

describe("splitCategoryAttributes", () => {
	it("separates variant axes from descriptive attributes", () => {
		const links: CategoryAttributeLink[] = [
			{ attribute: { id: "a1", name: "Size", type: "select", is_variant: true } },
			{ attribute: { id: "a2", name: "Ingredients", type: "text" } },
			{ attribute: { id: "a3", name: "Finish", type: "select", is_variant: false } },
		];
		const { descriptive, variantAxes } = splitCategoryAttributes(links);
		expect(variantAxes.map((l) => l.attribute.id)).toEqual(["a1"]);
		expect(descriptive.map((l) => l.attribute.id)).toEqual(["a2", "a3"]);
	});
});

describe("variantCombinations", () => {
	it("builds the cartesian product across axes with sorted option keys", () => {
		const combos = variantCombinations([sizeAxis, colorAxis]);
		expect(combos).toHaveLength(2);
		expect(combos[0].option_values).toEqual({
			"attr-color": "red",
			"attr-size": "s",
		});
		expect(combos[0].label).toBe("Small / Red");
	});

	it("ignores axes without selected values", () => {
		expect(
			variantCombinations([sizeAxis, { ...colorAxis, values: [] }]),
		).toHaveLength(2);
		expect(variantCombinations([{ ...sizeAxis, values: [] }])).toHaveLength(0);
	});
});

describe("buildVariantRowsPayload", () => {
	const value: VariantMatrixValue = {
		axes: [sizeAxis],
		rows: {},
	};

	it("converts AED prices to fils and floors quantities", () => {
		const combos = variantCombinations(value.axes);
		const withRows: VariantMatrixValue = {
			...value,
			rows: {
				[combos[0].key]: { price: "49.99", sku: " SK-1 ", quantity: "3" },
				[combos[1].key]: { price: "60", sku: "", quantity: "" },
			},
		};
		const payload = buildVariantRowsPayload(withRows);
		expect(payload).toEqual([
			{
				option_values: { "attr-size": "s" },
				name: "Small",
				price: 4999,
				sku: "SK-1",
				quantity_on_hand: 3,
			},
			{
				option_values: { "attr-size": "m" },
				name: "Medium",
				price: 6000,
				sku: undefined,
				quantity_on_hand: undefined,
			},
		]);
		expect(minVariantPriceFils(payload)).toBe(4999);
	});

	it("drops excluded rows and combos that already exist", () => {
		const combos = variantCombinations(value.axes);
		const existing = existingVariantKeys([
			{ option_values: { "attr-size": "s" } },
		]);
		const withRows: VariantMatrixValue = {
			...value,
			rows: {
				[combos[1].key]: { price: "10", sku: "", quantity: "", excluded: true },
			},
		};
		expect(buildVariantRowsPayload(withRows, existing)).toEqual([]);
	});
});

describe("rowsMissingPrice", () => {
	it("reports included rows without a positive price", () => {
		const value: VariantMatrixValue = { axes: [sizeAxis], rows: {} };
		expect(rowsMissingPrice(value)).toEqual(["Small", "Medium"]);

		const combos = variantCombinations(value.axes);
		const priced: VariantMatrixValue = {
			axes: [sizeAxis],
			rows: {
				[combos[0].key]: { price: "12", sku: "", quantity: "" },
				[combos[1].key]: { price: "", sku: "", quantity: "", excluded: true },
			},
		};
		expect(rowsMissingPrice(priced)).toEqual([]);
	});
});

describe("slugifyAxisName", () => {
	it("slugifies free-form option names", () => {
		expect(slugifyAxisName("Gift Wrap?")).toBe("gift_wrap");
		expect(slugifyAxisName("  ")).toBe("option");
	});
});
