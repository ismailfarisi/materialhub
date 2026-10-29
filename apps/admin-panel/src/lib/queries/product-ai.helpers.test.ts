import { describe, expect, test } from "vitest";
import { productAiSettingsQueryKey } from "./ai-settings";
import {
	extractProductAiDraftResponse,
	productAiDraftEndpoint,
} from "./products";

describe("product AI query helpers", () => {
	test("builds stable product AI settings key and draft endpoint", () => {
		expect(productAiSettingsQueryKey).toEqual([
			"admin",
			"settings",
			"ai",
			"product-content",
		]);
		expect(productAiDraftEndpoint("product-1")).toBe(
			"/admin/products/product-1/ai-enhance-content",
		);
	});

	test("extracts product AI draft from nested response envelopes", () => {
		const draft = {
			product: { name: "Moon Serum" },
			translations: [{ locale: "ar", name: "سيروم القمر" }],
			attributes: [{ attribute_id: "attr-skin", value: "oily" }],
			warnings: [],
		};

		expect(
			extractProductAiDraftResponse({
				statusCode: 200,
				data: { statusCode: 200, data: draft },
			}),
		).toEqual(draft);
	});
});
