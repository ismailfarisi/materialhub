import type { Spec } from "@/components/swatch";

/** A cart line as `useCart()` maps it. Optional fields arrive only when the API sends them. */
export interface CartLineItem {
	/** Cart item id (matches a quote's `blocking_error.affected_item_ids`). */
	id?: string;
	product_id?: string;
	variant_id: string;
	vendor_id?: string | null;
	vendor_name?: string | null;
	product_slug?: string | null;
	product_title: string;
	variant_label?: string | null;
	image_url: string;
	added_price?: number;
	current_price: number;
	is_stale?: boolean;
	quantity: number;
	/** Variant option values, e.g. `{ gsm: "300", size: "70×100 cm" }`. */
	options?: Record<string, unknown> | null;
	sku?: string | null;
	product_status?: string | null;
}

export interface SupplierGroup {
	key: string;
	vendorName: string;
	items: CartLineItem[];
	subtotalFils: number;
}

const MAX_SPECS = 4;
const UNIT_KEYS = /^(gsm|mm|cm|m|kg|g|ml|pcs)$/i;

function humanizeKey(key: string): string {
	const spaced = key.replace(/[_-]+/g, " ").trim();
	if (/^(gsm|sku|mm|cm|uom)$/i.test(spaced)) return spaced.toUpperCase();
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Specs to print on a line, from the variant's option values. Falls back to
 * the variant name so a line is never spec-less when the variant has one.
 */
export function lineSpecs(item: CartLineItem): Spec[] {
	const specs: Spec[] = [];
	for (const [key, raw] of Object.entries(item.options ?? {})) {
		if (raw == null || typeof raw === "object") continue;
		let value = String(raw).trim();
		if (!value) continue;
		// "gsm: 120" prints as "120 gsm" so a bare number never stands alone.
		if (UNIT_KEYS.test(key) && /^[\d.,]+$/.test(value)) value = `${value} ${key.toLowerCase()}`;
		specs.push({ label: humanizeKey(key), value });
		if (specs.length >= MAX_SPECS) break;
	}
	if (specs.length === 0 && item.variant_label) {
		specs.push({ label: "Variant", value: item.variant_label });
	}
	return specs;
}

/** A listing that was unpublished after it went into the cart can't be bought. */
export function isLineUnavailable(item: CartLineItem): boolean {
	return item.product_status != null && item.product_status !== "published";
}

export function lineTotalFils(item: CartLineItem): number {
	return item.current_price * item.quantity;
}

export function cartSubtotalFils(items: CartLineItem[]): number {
	return items.reduce((sum, item) => sum + lineTotalFils(item), 0);
}

export function cartPieceCount(items: CartLineItem[]): number {
	return items.reduce((sum, item) => sum + item.quantity, 0);
}

/** Group lines by supplier, keeping the order suppliers first appear in. */
export function groupBySupplier(items: CartLineItem[]): SupplierGroup[] {
	const groups = new Map<string, SupplierGroup>();
	for (const item of items) {
		const vendorName = item.vendor_name || "MaterialHub";
		const key = item.vendor_id || vendorName;
		let group = groups.get(key);
		if (!group) {
			group = { key, vendorName, items: [], subtotalFils: 0 };
			groups.set(key, group);
		}
		group.items.push(item);
		group.subtotalFils += lineTotalFils(item);
	}
	return [...groups.values()];
}
