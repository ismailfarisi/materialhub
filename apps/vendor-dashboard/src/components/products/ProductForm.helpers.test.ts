import { describe, expect, test } from "vitest";
import { buildSimpleProductInventoryPayload } from "./ProductForm.helpers";

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
