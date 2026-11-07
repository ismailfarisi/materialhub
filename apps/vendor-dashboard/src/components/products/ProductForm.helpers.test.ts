import { describe, expect, test } from "vitest";
import {
	buildArabicTranslationsPayload,
	buildSimpleProductInventoryPayload,
} from "./ProductForm.helpers";

describe("buildSimpleProductInventoryPayload", () => {
	test("includes quantity_on_hand for simple products when quantity is entered", () => {
		expect(
			buildSimpleProductInventoryPayload({
				hasVariants: false,
				quantityOnHand: "12",
			}),
		).toEqual({ quantity_on_hand: 12 });
	});

	test("omits quantity_on_hand for variants and blank values", () => {
		expect(
			buildSimpleProductInventoryPayload({
				hasVariants: true,
				quantityOnHand: "12",
			}),
		).toEqual({});
		expect(
			buildSimpleProductInventoryPayload({
				hasVariants: false,
				quantityOnHand: "",
			}),
		).toEqual({});
	});
});

describe("buildArabicTranslationsPayload", () => {
	const blank = { name: "", short_description: "", description: "" };

	test("omits translations when nothing is entered", () => {
		expect(buildArabicTranslationsPayload(blank, false)).toEqual({});
	});

	test("deletes a stored translation when all fields are cleared", () => {
		expect(buildArabicTranslationsPayload(blank, true)).toEqual({
			translations: [{ locale: "ar", name: "" }],
		});
	});

	test("requires the Arabic name for other Arabic content", () => {
		expect(
			buildArabicTranslationsPayload({ ...blank, description: "ورق كرافت" }, false).error,
		).toBeDefined();
	});

	test("builds the ar translation", () => {
		expect(
			buildArabicTranslationsPayload(
				{ name: " ورق كرافت بني 120 غرام ", short_description: "", description: "للتغليف" },
				false,
			),
		).toEqual({
			translations: [
				{
					locale: "ar",
					name: "ورق كرافت بني 120 غرام",
					short_description: null,
					description: "للتغليف",
				},
			],
		});
	});
});
