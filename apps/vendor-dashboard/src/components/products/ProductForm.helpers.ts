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

export interface ArabicTranslationDraft {
	name: string;
	short_description: string;
	description: string;
}

/**
 * The `translations` field for the product write API from the Arabic inputs.
 * - nothing entered and nothing stored: omit the field (undefined)
 * - all cleared after one was stored: send a blank name, which deletes it
 * - content without an Arabic name: an error, the API keys a translation on its name
 */
export function buildArabicTranslationsPayload(
	draft: ArabicTranslationDraft | undefined,
	hadStored: boolean,
): { translations?: Array<Record<string, string | null>>; error?: string } {
	const name = draft?.name.trim() ?? "";
	const short = draft?.short_description.trim() ?? "";
	const desc = draft?.description.trim() ?? "";
	if (!name && !short && !desc) {
		return hadStored ? { translations: [{ locale: "ar", name: "" }] } : {};
	}
	if (!name) return { error: "Add the Arabic product name to save Arabic content." };
	return {
		translations: [
			{
				locale: "ar",
				name,
				short_description: short || null,
				description: desc || null,
			},
		],
	};
}
