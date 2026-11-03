/**
 * Shapes of the buyer-facing API payloads the account pages read. Loose on
 * purpose: TypeORM relations arrive camelCase or snake_case, and older rows
 * may miss fields, so everything past the id is optional.
 */
export interface OrderItemRow {
	id: string;
	product_id?: string;
	variant_id?: string | null;
	product_name?: string;
	title?: string;
	name?: string;
	variant_name?: string | null;
	product_sku?: string | null;
	product_slug?: string | null;
	product_image_url?: string | null;
	product_snapshot?: { attributes?: unknown } | null;
	quantity?: number;
	unit_price?: number;
	line_total?: number | null;
	refunded_quantity?: number;
	refunded_amount?: number;
	is_reviewed?: boolean;
	status?: string;
}

export interface VendorOrderRow {
	id: string;
	vendor_order_number?: string;
	status?: string;
	carrier?: string | null;
	tracking_number?: string | null;
	items?: OrderItemRow[];
}

export interface OrderRow {
	id: string;
	order_number?: string;
	status?: string;
	payment_status?: string;
	created_at?: string;
	grand_total?: number;
	currency?: string;
	vendorOrders?: VendorOrderRow[];
	vendor_orders?: VendorOrderRow[];
}

export interface ReturnItemRow {
	id: string;
	quantity?: number;
	refund_amount?: number | null;
	product_name?: string;
	orderItem?: OrderItemRow;
	order_item?: OrderItemRow;
}

export interface ReturnRow {
	id: string;
	return_number?: string;
	status?: string;
	created_at?: string;
	refund_amount?: number | null;
}

export interface AddressRow {
	id: string;
	full_name?: string;
	phone?: string;
	building_name?: string;
	apartment?: string;
	floor?: string;
	street?: string;
	area?: string;
	city?: string;
	emirate?: string;
	is_default?: boolean;
}

export interface WalletTxRow {
	id: string;
	type?: string;
	amount: number;
	description?: string | null;
	created_at: string;
}

export interface SavedSearchRow {
	id: string;
	query: string;
	name?: string | null;
	notify_on_match?: boolean;
}

export interface WishlistRow {
	product_id: string;
	id: string;
	name: string;
	slug: string;
	price_min: number;
	price_max: number;
	images: string[];
}

/** The API's error message, else the fallback. */
export function apiErrorMessage(err: unknown, fallback: string): string {
	const e = err as { response?: { data?: { message?: unknown } }; message?: unknown } | null;
	const m = e?.response?.data?.message ?? e?.message;
	return typeof m === "string" && m ? m : fallback;
}
