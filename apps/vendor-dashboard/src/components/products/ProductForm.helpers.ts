export function buildSimpleProductInventoryPayload({
	hasVariants,
	quantityOnHand,
}: {
	hasVariants: boolean;
	quantityOnHand: string;
}): Record<string, number> {
	if (hasVariants || quantityOnHand.trim() === "") return {};
	return { quantity_on_hand: Number(quantityOnHand) };
}

export function getProductLevelQuantityOnHand(
	inventoryRecords?: Array<{
		variant_id?: string | null;
		quantity_on_hand?: number | null;
	}>,
): number {
	return (inventoryRecords ?? [])
		.filter((record) => !record.variant_id)
		.reduce((sum, record) => sum + (record.quantity_on_hand ?? 0), 0);
}
