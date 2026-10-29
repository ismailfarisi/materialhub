import { describe, expect, test } from "vitest";
import { applyProductAiDraftToState } from "./ProductAiEnhanceDialog";

describe("applyProductAiDraftToState", () => {
	test("maps product, Arabic translation, and attributes into edit state patches", () => {
		const result = applyProductAiDraftToState({
			product: {
				name: "Kraft Paper Roll",
				description: "Recycled kraft wrapping paper",
				ingredients: "100% recycled kraft pulp",
				usage_instructions: "Store flat in a dry place",
				meta_title: "Kraft Paper Roll",
				meta_description: "Recycled kraft wrapping paper for packaging.",
				tags: ["kraft", "recycled"],
			},
			translations: [
				{
					locale: "ar",
					name: "لفة ورق كرافت",
					description: "ورق تغليف كرافت معاد التدوير",
					ingredients: "لب كرافت معاد التدوير بنسبة 100%",
					usage_instructions: "يحفظ مسطحا في مكان جاف",
					meta_title: "لفة ورق كرافت",
					meta_description: "ورق تغليف كرافت معاد التدوير للتعبئة",
				},
			],
			attributes: [{ attribute_id: "attr-1", text_value: "Lightweight" }],
			warnings: ["Skipped uncertain grammage"],
		});

		expect(result.productPatch).toMatchObject({
			name: "Kraft Paper Roll",
			description: "Recycled kraft wrapping paper",
			tags: "kraft, recycled",
		});
		expect(result.translationPatch.ar.name).toBe("لفة ورق كرافت");
		expect(result.attributePatch["attr-1"]).toEqual({
			mode: "text",
			text_value: "Lightweight",
		});
	});

	test("normalizes AI attribute option values through category attribute options", () => {
		const result = applyProductAiDraftToState(
			{
				product: {},
				translations: [{ locale: "ar", name: "ورق" }],
				attributes: [
					{
						attribute_id: "attr-material",
						value: "kraft",
					},
					{
						attribute_id: "attr-finish",
						text_value: "  Matte  ",
					},
				],
			},
			[
				{
					attribute: {
						id: "attr-material",
						name: "Material",
						type: "select",
						values: [
							{
								id: "value-kraft",
								value: "kraft",
								display_value: "Kraft",
							},
						],
					},
				},
				{
					attribute: {
						id: "attr-finish",
						name: "Finish",
						type: "text",
						values: [],
					},
				},
			],
		);

		expect(result.attributePatch["attr-material"]).toEqual({
			mode: "single",
			value_id: "value-kraft",
		});
		expect(result.attributePatch["attr-finish"]).toEqual({
			mode: "text",
			text_value: "Matte",
		});
	});

	test("normalizes AI multi option values through category attribute options", () => {
		const result = applyProductAiDraftToState(
			{
				product: {},
				translations: [],
				attributes: [
					{
						attribute_id: "attr-use",
						values: ["Food safe", "water-resistant"],
					},
				],
			},
			[
				{
					attribute: {
						id: "attr-use",
						name: "Suitable for",
						type: "multiselect",
						values: [
							{
								id: "value-food-safe",
								value: "food safe",
								display_value: "Food safe",
							},
							{
								id: "value-water-resistant",
								value: "water-resistant",
								display_value: "Water resistant",
							},
						],
					},
				},
			],
		);

		expect(result.attributePatch["attr-use"]).toEqual({
			mode: "multi",
			value_ids: ["value-food-safe", "value-water-resistant"],
		});
	});

	test("handles non-string AI attribute values without throwing", () => {
		const result = applyProductAiDraftToState({
			product: {},
			translations: [],
			attributes: [
				{
					attribute_id: "attr-refillable",
					value: true as any,
				},
			],
		});

		expect(result.attributePatch["attr-refillable"]).toEqual({
			mode: "text",
			text_value: "true",
		});
	});
});
