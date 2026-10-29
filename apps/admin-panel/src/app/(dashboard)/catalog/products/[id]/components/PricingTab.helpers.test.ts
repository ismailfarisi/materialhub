import { describe, expect, test } from "vitest";
import {
	buildMarkOutOfStockAdjustments,
	buildProductInventoryMutationParams,
	isProductInventorySubmitDisabled,
} from "./PricingTab.helpers";

describe("buildProductInventoryMutationParams", () => {
	test("builds product-level restock params without a variant id", () => {
		expect(
			buildProductInventoryMutationParams({
				productId: "product-1",
				action: "restock",
				quantity: "8",
				warehouseId: "warehouse-1",
			}),
		).toEqual({
			productId: "product-1",
			quantity: 8,
			warehouse_id: "warehouse-1",
		});
	});

	test("builds product-level adjust params with reason and signed quantity", () => {
		expect(
			buildProductInventoryMutationParams({
				productId: "product-1",
				action: "adjust",
				quantity: "-3",
				reason: "stock count correction",
			}),
		).toEqual({
			productId: "product-1",
			quantity: -3,
			reason: "stock count correction",
		});
	});
});

describe("isProductInventorySubmitDisabled", () => {
	test("restock is enabled only for a strictly positive quantity", () => {
		expect(isProductInventorySubmitDisabled({ action: "restock", quantity: "5" })).toBe(false);
		expect(isProductInventorySubmitDisabled({ action: "restock", quantity: "0" })).toBe(true);
		// a negative used to slip through and silently add stock
		expect(isProductInventorySubmitDisabled({ action: "restock", quantity: "-5" })).toBe(true);
	});

	test("adjust allows negatives (reducing stock) when a reason is given", () => {
		expect(
			isProductInventorySubmitDisabled({ action: "adjust", quantity: "-3", reason: "recount" }),
		).toBe(false);
		expect(
			isProductInventorySubmitDisabled({ action: "adjust", quantity: "5", reason: "recount" }),
		).toBe(false);
	});

	test("adjust is disabled at 0 (no-op) and when the reason is blank", () => {
		expect(
			isProductInventorySubmitDisabled({ action: "adjust", quantity: "0", reason: "recount" }),
		).toBe(true);
		expect(isProductInventorySubmitDisabled({ action: "adjust", quantity: "-3" })).toBe(true);
		expect(
			isProductInventorySubmitDisabled({ action: "adjust", quantity: "-3", reason: "   " }),
		).toBe(true);
	});

	test("disabled for empty or non-numeric input in either mode", () => {
		expect(isProductInventorySubmitDisabled({ action: "restock", quantity: "" })).toBe(true);
		expect(
			isProductInventorySubmitDisabled({ action: "adjust", quantity: "abc", reason: "recount" }),
		).toBe(true);
	});
});

describe("buildMarkOutOfStockAdjustments", () => {
	test("emits one negative adjust per in-stock warehouse row, skipping empties", () => {
		expect(
			buildMarkOutOfStockAdjustments("product-1", [
				{ warehouse_id: "wh-1", quantity_on_hand: 4 },
				{ warehouse_id: "wh-2", quantity_on_hand: 0 },
				{ warehouse_id: "wh-3", quantity_on_hand: 7 },
			]),
		).toEqual([
			{ productId: "product-1", quantity: -4, reason: "Marked out of stock", warehouse_id: "wh-1" },
			{ productId: "product-1", quantity: -7, reason: "Marked out of stock", warehouse_id: "wh-3" },
		]);
	});

	test("omits warehouse_id when a row has none", () => {
		expect(
			buildMarkOutOfStockAdjustments("product-1", [{ quantity_on_hand: 2 }]),
		).toEqual([{ productId: "product-1", quantity: -2, reason: "Marked out of stock" }]);
	});

	test("returns nothing when all rows are already empty", () => {
		expect(
			buildMarkOutOfStockAdjustments("product-1", [
				{ warehouse_id: "wh-1", quantity_on_hand: 0 },
				{ warehouse_id: "wh-2", quantity_on_hand: null },
			]),
		).toEqual([]);
	});
});
