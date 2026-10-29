import { describe, expect, test } from "vitest";
import { applyProductAiDraftToState } from "./ProductAiEnhanceDialog";

describe("applyProductAiDraftToState", () => {
	test("maps product, Arabic translation, and attributes into edit state patches", () => {
		const result = applyProductAiDraftToState({
			product: {
				name: "Moon Serum",
				description: "Hydrating serum",
				ingredients: "Water, Glycerin",
				usage_instructions: "Apply nightly",
				meta_title: "Moon Serum",
				meta_description: "Hydrating serum for nightly care.",
				tags: ["serum", "hydrating"],
			},
			translations: [
				{
					locale: "ar",
					name: "سيروم القمر",
					description: "سيروم مرطب",
					ingredients: "ماء، جلسرين",
					usage_instructions: "يستخدم مساء",
					meta_title: "سيروم القمر",
					meta_description: "سيروم مرطب للعناية الليلية",
				},
			],
			attributes: [{ attribute_id: "attr-1", text_value: "Lightweight" }],
			warnings: ["Skipped uncertain SPF"],
		});

		expect(result.productPatch).toMatchObject({
			name: "Moon Serum",
			description: "Hydrating serum",
			tags: "serum, hydrating",
		});
		expect(result.translationPatch.ar.name).toBe("سيروم القمر");
		expect(result.attributePatch["attr-1"]).toEqual({
			mode: "text",
			text_value: "Lightweight",
		});
	});

	test("normalizes AI attribute option values through category attribute options", () => {
		const result = applyProductAiDraftToState(
			{
				product: {},
				translations: [{ locale: "ar", name: "سيروم" }],
				attributes: [
					{
						attribute_id: "attr-skin",
						value: "oily",
					},
					{
						attribute_id: "attr-finish",
						text_value: "  Dewy  ",
					},
				],
			},
			[
				{
					attribute: {
						id: "attr-skin",
						name: "Skin type",
						type: "select",
						values: [
							{
								id: "value-oily",
								value: "oily",
								display_value: "Oily",
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

		expect(result.attributePatch["attr-skin"]).toEqual({
			mode: "single",
			value_id: "value-oily",
		});
		expect(result.attributePatch["attr-finish"]).toEqual({
			mode: "text",
			text_value: "Dewy",
		});
	});

	test("normalizes AI multi option values through category attribute options", () => {
		const result = applyProductAiDraftToState(
			{
				product: {},
				translations: [],
				attributes: [
					{
						attribute_id: "attr-concern",
						values: ["Acne", "dark-spots"],
					},
				],
			},
			[
				{
					attribute: {
						id: "attr-concern",
						name: "Concern",
						type: "multiselect",
						values: [
							{
								id: "value-acne",
								value: "acne",
								display_value: "Acne",
							},
							{
								id: "value-dark-spots",
								value: "dark-spots",
								display_value: "Dark spots",
							},
						],
					},
				},
			],
		);

		expect(result.attributePatch["attr-concern"]).toEqual({
			mode: "multi",
			value_ids: ["value-acne", "value-dark-spots"],
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
