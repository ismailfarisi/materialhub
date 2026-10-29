export type ProductInventoryAction = "restock" | "adjust";

export function buildProductInventoryMutationParams({
	productId,
	action,
	quantity,
	reason,
	warehouseId,
}: {
	productId: string;
	action: ProductInventoryAction;
	quantity: string;
	reason?: string;
	warehouseId?: string;
}) {
	const parsedQuantity = Number(quantity);
	const params: {
		productId: string;
		quantity: number;
		reason?: string;
		warehouse_id?: string;
	} = {
		productId,
		quantity: action === "restock" ? Math.abs(parsedQuantity) : parsedQuantity,
	};

	if (action === "adjust") params.reason = reason?.trim() ?? "";
	if (warehouseId) params.warehouse_id = warehouseId;

	return params;
}

/**
 * Whether the Restock/Adjust submit button should be disabled for the current input.
 *
 * - Restock *adds* stock and the API rejects `quantity < 1`, so it needs a strictly
 *   positive number. (A negative used to slip through — `buildProductInventoryMutationParams`
 *   `Math.abs()`es it, which silently added stock.)
 * - Adjust applies a signed delta: a negative reduces stock (down to and including 0),
 *   which is how a product goes out of stock, so negatives are allowed. A 0 delta changes
 *   nothing, and the reason field is required.
 */
export function isProductInventorySubmitDisabled({
	action,
	quantity,
	reason,
}: {
	action: ProductInventoryAction;
	quantity: string;
	reason?: string;
}): boolean {
	const trimmed = quantity.trim();
	const amount = Number(trimmed);
	if (trimmed === "" || !Number.isFinite(amount)) return true;
	if (action === "restock") return amount <= 0;
	// adjust
	if (amount === 0) return true;
	return !reason?.trim();
}

/**
 * One adjust call per product-level inventory row that still holds stock, each
 * subtracting exactly that warehouse's on-hand — the set of mutations a single
 * "Mark out of stock" click fires. Rows already at 0 are skipped.
 */
export function buildMarkOutOfStockAdjustments(
	productId: string,
	inventory: Array<{ warehouse_id?: string | null; quantity_on_hand?: number | null }>,
): Array<{ productId: string; quantity: number; reason: string; warehouse_id?: string }> {
	return inventory
		.filter((inv) => (inv.quantity_on_hand ?? 0) > 0)
		.map((inv) => {
			const params: {
				productId: string;
				quantity: number;
				reason: string;
				warehouse_id?: string;
			} = {
				productId,
				quantity: -(inv.quantity_on_hand ?? 0),
				reason: "Marked out of stock",
			};
			if (inv.warehouse_id) params.warehouse_id = inv.warehouse_id;
			return params;
		});
}
