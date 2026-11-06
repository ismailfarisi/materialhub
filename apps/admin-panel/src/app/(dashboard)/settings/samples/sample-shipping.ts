/** Key of the admin-set flat shipping charged per supplier for sample-only shipments. */
export const SAMPLE_SHIPPING_KEY = "sample_shipping_rate_fils";
/** What checkout charges when the setting is missing (order-service DEFAULT_SAMPLE_SHIPPING_FILS). */
export const DEFAULT_SAMPLE_SHIPPING_FILS = 1000;
/** A sanity cap: AED 500 for a sample shipment is certainly a typo. */
export const MAX_SAMPLE_SHIPPING_FILS = 50000;

/** "10" or "7.50" (AED) → fils; null when it isn't a valid amount. */
export function parseAedToFils(text: string): number | null {
	const t = text.trim();
	if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
	const fils = Math.round(Number.parseFloat(t) * 100);
	return fils <= MAX_SAMPLE_SHIPPING_FILS ? fils : null;
}

/** The stored setting value (a fils string) as AED text for the input. */
export function filsSettingToAed(value: unknown): string {
	const n = Math.trunc(Number(value));
	return (
		(Number.isFinite(n) && n >= 0 ? n : DEFAULT_SAMPLE_SHIPPING_FILS) / 100 + ""
	);
}
