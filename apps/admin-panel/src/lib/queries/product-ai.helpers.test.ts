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
			product: { name: "Kraft paper roll, 120 gsm" },
			translations: [{ locale: "ar", name: "لفة ورق كرافت، 120 غم" }],
			attributes: [{ attribute_id: "attr-finish", value: "matte" }],
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
